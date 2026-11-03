import { existsSync, readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { join } from "node:path";
import type { IdentitySummary, ProfileOs } from "@ppb/shared";
import { Camoufox } from "camoufox-js";
import { generateFingerprint } from "camoufox-js/dist/fingerprints.js";
import { publicIP } from "camoufox-js/dist/ip.js";
import { downloadMMDB, getGeolocation } from "camoufox-js/dist/locale.js";
import {
  ensureCamoufoxInstalled,
  getPath,
  INSTALL_DIR,
  installedVerStr,
} from "camoufox-js/dist/pkgman.js";
import { sampleWebGL } from "camoufox-js/dist/webgl/sample.js";
import type { Fingerprint } from "fingerprint-generator";
import type { BrowserContext } from "playwright-core";

/**
 * Everything that makes a profile look like the same device on every launch.
 * Generated once at profile creation and persisted; Camoufox would otherwise re-randomize per launch.
 */
export interface Identity {
  version: 1;
  os: ProfileOs;
  fingerprint: Fingerprint;
  webgl: { vendor: string; renderer: string };
  /** Camoufox config keys Camoufox randomizes per launch unless provided. */
  seeds: Record<string, number>;
  /** Locale picked for the proxy's country; reused while the exit country stays the same. */
  locale: { country: string; value: string } | null;
}

export interface Geo {
  ip: string;
  country: string;
  timezone: string;
  locale: string;
}

const OS_SHORT: Record<ProfileOs, "win" | "mac" | "lin"> = {
  windows: "win",
  macos: "mac",
  linux: "lin",
};
/** Rough desktop market share; picks the OS when the user does not choose one (non-macOS hosts). */
const OS_WEIGHTS: [ProfileOs, number][] = [
  ["windows", 70],
  ["macos", 25],
  ["linux", 5],
];

/**
 * On a macOS host the default is a macOS fingerprint: Camoufox's macOS build paints text in fonts that exist
 * only in its bundle (Segoe UI, Calibri, … used by Windows/Linux fingerprints) with the wrong glyphs in visible
 * windows (daijro/camoufox#918). Headless rendering and screenshots are unaffected.
 */
export async function generateIdentity(os?: ProfileOs): Promise<Identity> {
  const chosen = os ?? (process.platform === "darwin" ? "macos" : pickOs());
  const fingerprint = generateFingerprint(undefined, { operatingSystems: [chosen] });
  const webgl = (await sampleWebGL(OS_SHORT[chosen])) as unknown as Record<string, unknown>;
  const vendor = webgl["webGl:vendor"];
  const renderer = webgl["webGl:renderer"];
  if (typeof vendor !== "string" || typeof renderer !== "string") {
    throw new Error("Camoufox WebGL sample is missing vendor/renderer");
  }
  return {
    version: 1,
    os: chosen,
    fingerprint,
    webgl: { vendor, renderer },
    seeds: {
      "fonts:spacing_seed": randomInt(1, 2 ** 32 - 1),
      "audio:seed": randomInt(1, 2 ** 32 - 1),
      "canvas:seed": randomInt(1, 2 ** 32 - 1),
      "canvas:aaOffset": randomInt(-50, 51),
      "window.history.length": randomInt(1, 6),
    },
    locale: null,
  };
}

export interface LaunchOptions {
  userDataDir: string;
  identity: Identity;
  /** Local forwarder URL; null for a direct connection. */
  proxyUrl: string | null;
  geo: Geo;
  headless: boolean;
}

export async function launch(options: LaunchOptions): Promise<BrowserContext> {
  const { identity } = options;
  const known = knownProperties();
  const seeds = Object.fromEntries(
    Object.entries(identity.seeds).filter(([key]) => known === null || key in known),
  );
  return Camoufox({
    user_data_dir: options.userDataDir,
    headless: options.headless,
    os: identity.os,
    fingerprint: identity.fingerprint,
    webgl_config: [identity.webgl.vendor, identity.webgl.renderer],
    config: seeds,
    geoip: options.geo.ip,
    locale: options.geo.locale,
    proxy: options.proxyUrl ?? undefined,
    // Seeds and a stored fingerprint trip Camoufox's "manual config" leak warnings; they are intentional here.
    i_know_what_im_doing: true,
  });
}

/** Resolves the public IP (through the proxy when given) and its location. */
export async function resolveGeo(proxyUrl: string | null, identity?: Identity): Promise<Geo> {
  const ip = await publicIP(proxyUrl ?? undefined);
  const location = await getGeolocation(ip);
  const country = location.locale.region ?? "";
  const stored = identity?.locale;
  return {
    ip,
    country,
    timezone: location.timezone,
    locale: stored && stored.country === country ? stored.value : location.locale.asString(),
  };
}

export function engineStatus(): { installed: boolean; version: string | null } {
  try {
    return { installed: true, version: installedVerStr() };
  } catch {
    return { installed: false, version: null };
  }
}

/**
 * Ensures the pinned Camoufox build and the GeoLite2 database are in place.
 * Cheap after the first call: each step checks before doing work.
 */
export async function installEngine(): Promise<void> {
  await ensureCamoufoxInstalled();
  if (!existsSync(join(INSTALL_DIR.toString(), "GeoLite2-City.mmdb"))) await downloadMMDB();
}

/**
 * The UA the browser actually sends: Camoufox rewrites the stored Firefox major to the installed build's.
 * `firefoxMajor` comes from `engineStatus()`; callers resolve it once per listing.
 */
export function summarize(identity: Identity, firefoxMajor: string | undefined): IdentitySummary {
  const { fingerprint } = identity;
  const userAgent = fingerprint.navigator.userAgent;
  return {
    os: identity.os,
    userAgent: firefoxMajor
      ? userAgent.replaceAll(/(?<!\d)(1\d{2})(\.0)(?!\d)/g, `${firefoxMajor}$2`)
      : userAgent,
    screen: { width: fingerprint.screen.width, height: fingerprint.screen.height },
    webgl: identity.webgl,
  };
}

function pickOs(): ProfileOs {
  let roll = randomInt(0, 100);
  for (const [os, weight] of OS_WEIGHTS) {
    if (roll < weight) return os;
    roll -= weight;
  }
  return "windows";
}

let cachedProperties: Record<string, string> | null | undefined;
function knownProperties(): Record<string, string> | null {
  if (cachedProperties !== undefined) return cachedProperties;
  try {
    const file = getPath("properties.json");
    cachedProperties = existsSync(file)
      ? Object.fromEntries(
          (JSON.parse(readFileSync(file, "utf8")) as { property: string; type: string }[]).map(
            (p) => [p.property, p.type],
          ),
        )
      : null;
  } catch {
    cachedProperties = null;
  }
  return cachedProperties;
}
