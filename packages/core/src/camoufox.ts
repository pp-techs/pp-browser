import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import type { IdentitySummary, ProfileOs } from "@ppb/shared";
import { Camoufox } from "camoufox";
import { generateFingerprint } from "camoufox/dist/fingerprints.js";
import { downloadMmdb, getGeolocation, getMmdbPath } from "camoufox/dist/geolocation.js";
import { publicIP } from "camoufox/dist/ip.js";
import { ensureCamoufoxInstalled, installedVerStr } from "camoufox/dist/pkgman.js";
import { ensureModel } from "fpgen-js";
import type { BrowserContext } from "playwright-core";

/**
 * The part of a profile's identity that is cheap to keep in memory: what the UI shows plus the locale
 * pinned to the exit country. The fingerprint itself is ~350 KB of JSON (fonts, voices, mime types…), so
 * it lives next to this record as a gzip blob and is only read when the profile launches.
 *
 * Generated once at profile creation and persisted; Camoufox would otherwise re-draw one per launch.
 */
export interface Identity {
  version: 2;
  os: ProfileOs;
  summary: Omit<IdentitySummary, "os">;
  /** Locale picked for the proxy's country; reused while the exit country stays the same. */
  locale: { country: string; value: string } | null;
}

/** The fields of an fpgen fingerprint that ppb reads; the rest is handed to Camoufox untouched. */
interface FpgenFingerprint {
  navigator: { userAgent: string };
  screen: { width: number; height: number };
  gpu: { vendor: string; renderer: string };
}

export interface Geo {
  ip: string;
  country: string;
  timezone: string;
  locale: string;
}

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
export async function generateIdentity(
  os?: ProfileOs,
): Promise<{ identity: Identity; fingerprint: Buffer }> {
  const chosen = os ?? (process.platform === "darwin" ? "macos" : pickOs());
  // fpgen draws from a downloaded model; generateFingerprint throws until it is on disk.
  await ensureModel();
  // fpgen's output is untyped JSON; the three fields read below are part of its documented shape.
  const fp = generateFingerprint({ os: chosen }) as unknown as FpgenFingerprint;
  return {
    identity: {
      version: 2,
      os: chosen,
      summary: {
        userAgent: fp.navigator.userAgent,
        screen: { width: fp.screen.width, height: fp.screen.height },
        webgl: { vendor: fp.gpu.vendor, renderer: fp.gpu.renderer },
      },
      locale: null,
    },
    fingerprint: gzipSync(JSON.stringify(fp)),
  };
}

export interface LaunchOptions {
  userDataDir: string;
  identity: Identity;
  /** The gzip blob stored with the profile (see {@link Identity}). */
  fingerprint: Buffer;
  /** Local forwarder URL; null for a direct connection. */
  proxyUrl: string | null;
  geo: Geo;
  headless: boolean;
}

export async function launch(options: LaunchOptions): Promise<BrowserContext> {
  const fingerprint: Record<string, unknown> = JSON.parse(
    gunzipSync(options.fingerprint).toString("utf8"),
  );
  return Camoufox({
    persistent_context: true,
    user_data_dir: options.userDataDir,
    headless: options.headless,
    os: options.identity.os,
    fingerprint,
    geoip: options.geo.ip,
    locale: options.geo.locale,
    proxy: options.proxyUrl ? { server: options.proxyUrl } : undefined,
    // A stored fingerprint trips Camoufox's "manual config" leak warning; it is intentional here.
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
    locale: stored && stored.country === country ? stored.value : location.locale.asString,
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
 * Ensures the Camoufox build this library is paired with and the GeoIP database are in place.
 * Cheap after the first call: each step checks before doing work.
 */
export async function installEngine(): Promise<void> {
  await ensureCamoufoxInstalled();
  await ensureModel();
  if (!existsSync(getMmdbPath())) await downloadMmdb();
}

/**
 * The UA the browser actually sends: Camoufox rewrites the stored Firefox major to the installed build's.
 * `firefoxMajor` comes from `engineStatus()`; callers resolve it once per listing.
 */
export function summarize(identity: Identity, firefoxMajor: string | undefined): IdentitySummary {
  const { userAgent, screen, webgl } = identity.summary;
  return {
    os: identity.os,
    userAgent: firefoxMajor
      ? userAgent.replaceAll(/(?<!\d)(1\d{2})(\.0)(?!\d)/g, `${firefoxMajor}$2`)
      : userAgent,
    screen,
    webgl,
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
