#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { engineStatus, installEngine, resolvePaths } from "@ppb/core";
import { createPpMcpServer } from "@ppb/mcp";
import {
  osSchema,
  PpbError,
  workflowDefinitionSchema,
  type PpbClient,
  type Profile,
  type Proxy,
} from "@ppb/shared";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Command, InvalidArgumentError, Option } from "commander";
import pkg from "../package.json" with { type: "json" };
import {
  connect,
  DEFAULT_DAEMON,
  daemonUrl,
  loadToken,
  readDaemonInfo,
  runDaemon,
  stopDaemon,
} from "./daemon.ts";

const paths = resolvePaths();
const program = new Command()
  .name("ppb")
  .description("Multi-profile anti-detect browser manager: profiles, proxies, web UI and MCP")
  .version(pkg.version)
  .option("--json", "print machine-readable JSON");

const json = () => program.opts<{ json?: boolean }>().json === true;
const client = () => connect(paths, DEFAULT_DAEMON);

function out(value: unknown, human?: () => void): void {
  if (json() || !human) console.log(JSON.stringify(value, null, 2));
  else human();
}

function table(rows: Record<string, string | number | boolean | null | undefined>[]): void {
  if (rows.length === 0) {
    console.log("(none)");
    return;
  }
  const keys = Object.keys(rows[0]!);
  const cells = rows.map((row) =>
    keys.map((key) => (row[key] === null || row[key] === undefined ? "-" : String(row[key]))),
  );
  const widths = keys.map((key, i) => Math.max(key.length, ...cells.map((c) => c[i]!.length)));
  console.log(keys.map((key, i) => key.toUpperCase().padEnd(widths[i]!)).join("  "));
  for (const c of cells) console.log(c.map((cell, i) => cell.padEnd(widths[i]!)).join("  "));
}

const profileRow = (p: Profile) => ({
  name: p.name,
  id: p.id,
  status: p.runtime.status,
  group: p.group,
  proxy: p.proxy?.name,
  ip: p.runtime.ip,
  os: p.identity.os,
  pages: p.runtime.status === "running" ? p.runtime.pageCount : null,
  mem: p.runtime.memoryMb === null ? null : `${p.runtime.memoryMb}MB`,
});

const proxyRow = (p: Proxy) => ({
  name: p.name,
  id: p.id,
  url: p.url,
  profiles: p.profileCount,
  check: p.lastCheck
    ? p.lastCheck.ok
      ? `ok ${p.lastCheck.ip} ${p.lastCheck.country}`
      : "failed"
    : null,
});

function printProfile(p: Profile): void {
  table([profileRow(p)]);
  if (p.runtime.lastError) console.log(`\nerror: ${p.runtime.lastError}`);
}

const parseIntArg = (value: string) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0)
    throw new InvalidArgumentError("expected a non-negative integer");
  return n;
};

// ── setup & daemon ─────────────────────────────────────────────────────────

program
  .command("setup")
  .description("download the Camoufox browser build and GeoIP database")
  .action(async () => {
    await installEngine();
    const status = engineStatus();
    out(status, () => console.log(`Camoufox ${status.version} ready`));
  });

program
  .command("status")
  .description("daemon and engine status")
  .action(async () => out(await (await client()).status()));

const daemon = program.command("daemon").description("manage the background daemon");
daemon
  .command("run")
  .description("run the daemon in the foreground")
  .option("--host <host>", "bind address", DEFAULT_DAEMON.host)
  .option("--port <port>", "port", parseIntArg, DEFAULT_DAEMON.port)
  .option(
    "--max-running <n>",
    "max profiles running at once",
    parseIntArg,
    DEFAULT_DAEMON.maxRunning,
  )
  .action((opts: { host: string; port: number; maxRunning: number }) =>
    runDaemon(paths, pkg.version, opts),
  );
daemon
  .command("start")
  .description("start the daemon in the background")
  .action(async () => {
    await client();
    const info = readDaemonInfo(paths)!;
    out(info, () => console.log(`daemon running at ${daemonUrl(info)} (pid ${info.pid})`));
  });
daemon
  .command("stop")
  .description("stop the daemon and every running profile")
  .action(async () => {
    const stopped = await stopDaemon(paths);
    out({ stopped }, () => console.log(stopped ? "daemon stopped" : "daemon not running"));
  });

program
  .command("ui")
  .description("open the web UI in the default browser")
  .option("--no-open", "only print the URL")
  .action(async (opts: { open: boolean }) => {
    await client();
    const info = readDaemonInfo(paths)!;
    const url = `${daemonUrl(info)}/#token=${loadToken(paths)}`;
    console.log(url);
    if (opts.open) {
      const opener =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "explorer"
            : "xdg-open";
      execFile(opener, [url]).unref();
    }
  });

program
  .command("mcp")
  .description("serve MCP over stdio (bridges to the daemon)")
  .action(async () => {
    const api = await client();
    serveStdio(() => createPpMcpServer(api, pkg.version));
    console.error(`ppb MCP (stdio) connected to daemon`);
  });

program
  .command("token")
  .description("print the API bearer token (for REST and HTTP MCP clients)")
  .action(() => console.log(loadToken(paths)));

// ── profiles ───────────────────────────────────────────────────────────────

const profile = program.command("profile").alias("profiles").description("manage browser profiles");
profile
  .command("ls")
  .description("list profiles")
  .option("-g, --group <group>", "only this group")
  .action(async (opts: { group?: string }) => {
    const all = await (await client()).listProfiles();
    const rows = opts.group ? all.filter((p) => p.group === opts.group) : all;
    out(rows, () => table(rows.map(profileRow)));
  });
profile
  .command("create <name>")
  .description("create a profile with a new persistent fingerprint")
  .addOption(
    new Option(
      "--os <os>",
      "fingerprint OS (default: macos on macOS hosts, else weighted random)",
    ).choices(osSchema.options),
  )
  .option("-p, --proxy <proxy>", "proxy id or name")
  .option("-g, --group <group>")
  .option("--notes <notes>")
  .action(
    async (
      name: string,
      opts: { os?: "windows" | "macos" | "linux"; proxy?: string; group?: string; notes?: string },
    ) => {
      const created = await (
        await client()
      ).createProfile({
        name,
        os: opts.os,
        proxyId: opts.proxy,
        group: opts.group,
        notes: opts.notes,
      });
      out(created, () => printProfile(created));
    },
  );
profile
  .command("show <profile>")
  .description("show a profile")
  .action(async (ref: string) => out(await (await client()).getProfile(ref)));
profile
  .command("edit <profile>")
  .description("rename, regroup or rebind a proxy (use --proxy none to detach)")
  .option("--name <name>")
  .option("-g, --group <group>")
  .option("--notes <notes>")
  .option("-p, --proxy <proxy>")
  .action(
    async (
      ref: string,
      opts: { name?: string; group?: string; notes?: string; proxy?: string },
    ) => {
      const updated = await (
        await client()
      ).updateProfile(ref, {
        name: opts.name,
        group: opts.group,
        notes: opts.notes,
        proxyId: opts.proxy === undefined ? undefined : opts.proxy === "none" ? null : opts.proxy,
      });
      out(updated, () => printProfile(updated));
    },
  );
profile
  .command("rm <profile...>")
  .description("delete profiles and their browser data")
  .action(async (refs: string[]) => {
    const api = await client();
    for (const ref of refs) await api.deleteProfile(ref);
    out({ deleted: refs }, () => console.log(`deleted ${refs.join(", ")}`));
  });

program
  .command("open <profile>")
  .description("launch a profile with a visible window")
  .action(async (ref: string) => {
    const started = await (await client()).startProfile(ref, { headless: false });
    out(started, () => printProfile(started));
    if (process.platform === "darwin" && started.identity.os !== "macos") {
      console.error(
        `warning: ${started.name} has a ${started.identity.os} fingerprint; on macOS, Camoufox draws text in its bundled ` +
          `${started.identity.os} fonts with wrong glyphs in visible windows. Headless/agent use is unaffected. ` +
          `For manual browsing create a macos profile.`,
      );
    }
  });
program
  .command("start <profile...>")
  .description("launch profiles")
  .option("--headless", "no visible window")
  .action(async (refs: string[], opts: { headless?: boolean }) => {
    const api = await client();
    const started = await Promise.all(
      refs.map((ref) => api.startProfile(ref, { headless: opts.headless ?? false })),
    );
    out(started, () => table(started.map(profileRow)));
  });
program
  .command("stop [profile...]")
  .description("stop profiles")
  .option("-a, --all", "stop every running profile")
  .action(async (refs: string[], opts: { all?: boolean }) => {
    const api = await client();
    const targets = opts.all
      ? (await api.listProfiles()).filter((p) => p.runtime.status === "running").map((p) => p.id)
      : refs;
    if (targets.length === 0)
      throw new PpbError("INVALID_INPUT", "Name profiles to stop or pass --all");
    const stopped = await Promise.all(targets.map((ref) => api.stopProfile(ref)));
    out(stopped, () => table(stopped.map(profileRow)));
  });
program
  .command("ps")
  .description("list running profiles with memory usage")
  .action(async () => {
    const running = (await (await client()).listProfiles()).filter(
      (p) => p.runtime.status !== "stopped",
    );
    out(running, () => {
      table(running.map(profileRow));
      const total = running.reduce((sum, p) => sum + (p.runtime.memoryMb ?? 0), 0);
      if (running.length > 0) console.log(`\ntotal memory: ${total}MB`);
    });
  });

// ── proxies ────────────────────────────────────────────────────────────────

const proxy = program.command("proxy").alias("proxies").description("manage proxies");
proxy
  .command("ls")
  .description("list proxies")
  .action(async () => {
    const proxies = await (await client()).listProxies();
    out(proxies, () => table(proxies.map(proxyRow)));
  });
proxy
  .command("add <url>")
  .description("add a proxy: scheme://user:pass@host:port or host:port:user:pass")
  .option("-n, --name <name>")
  .action(async (url: string, opts: { name?: string }) => {
    const created = await (await client()).createProxy({ url, name: opts.name });
    out(created, () => table([proxyRow(created)]));
  });
proxy
  .command("import <file>")
  .description("import proxies, one per line ('-' reads stdin)")
  .action(async (file: string) => {
    const text = readFileSync(file === "-" ? 0 : file, "utf8");
    const result = await (await client()).importProxies(text);
    out(result, () => {
      console.log(`imported ${result.created.length}`);
      for (const e of result.errors) console.log(`line ${e.line}: ${e.error}`);
    });
  });
proxy
  .command("edit <proxy>")
  .option("-n, --name <name>")
  .option("--url <url>")
  .action(async (ref: string, opts: { name?: string; url?: string }) => {
    const updated = await (await client()).updateProxy(ref, opts);
    out(updated, () => table([proxyRow(updated)]));
  });
proxy
  .command("rm <proxy...>")
  .description("delete proxies (must not be bound to a profile)")
  .action(async (refs: string[]) => {
    const api = await client();
    for (const ref of refs) await api.deleteProxy(ref);
    out({ deleted: refs }, () => console.log(`deleted ${refs.join(", ")}`));
  });
proxy
  .command("check <proxy...>")
  .description("test proxies: exit IP, country, timezone, latency")
  .action(async (refs: string[]) => {
    const api = await client();
    const results = await Promise.all(
      refs.map(async (ref) => ({ proxy: ref, ...(await api.checkProxy(ref)) })),
    );
    out(results, () =>
      table(
        results.map((r) => ({
          proxy: r.proxy,
          ok: r.ok,
          ip: r.ip,
          country: r.country,
          timezone: r.timezone,
          latency: r.latencyMs === undefined ? null : `${r.latencyMs}ms`,
          error: r.error,
        })),
      ),
    );
  });

// ── pages ──────────────────────────────────────────────────────────────────

const page = program.command("page").description("drive pages of a running profile");
const pageOpt = new Option("--page <pageId>", "page id (default: most recently used)");
const withPage = async (fn: (api: PpbClient) => Promise<unknown>) => {
  const result = await fn(await client());
  out(result);
};

page
  .command("ls <profile>")
  .description("list pages")
  .action((ref: string) => withPage((api) => api.listPages(ref)));
page
  .command("new <profile> [url]")
  .description("open a page")
  .action((ref: string, url?: string) => withPage((api) => api.newPage(ref, { url })));
page
  .command("close <profile> <pageId>")
  .action((ref: string, pageId: string) =>
    withPage((api) => api.closePage(ref, pageId).then(() => ({ closed: pageId }))),
  );
page
  .command("goto <profile> <url>")
  .addOption(pageOpt)
  .action((ref: string, url: string, opts: { page?: string }) =>
    withPage((api) => api.goto(ref, { url, pageId: opts.page })),
  );
page
  .command("snapshot <profile>")
  .description("accessibility snapshot with element refs")
  .addOption(pageOpt)
  .action(async (ref: string, opts: { page?: string }) => {
    const snap = await (await client()).snapshot(ref, { pageId: opts.page });
    out(snap, () => console.log(`# ${snap.pageId} ${snap.title}\n# ${snap.url}\n${snap.snapshot}`));
  });
page
  .command("click <profile> <target>")
  .description("click a ref (e12) or selector")
  .addOption(pageOpt)
  .action((ref: string, target: string, opts: { page?: string }) =>
    withPage((api) => api.click(ref, { target, pageId: opts.page })),
  );
page
  .command("type <profile> <target> <text>")
  .addOption(pageOpt)
  .option("--submit", "press Enter afterwards")
  .action((ref: string, target: string, text: string, opts: { page?: string; submit?: boolean }) =>
    withPage((api) => api.type(ref, { target, text, submit: opts.submit, pageId: opts.page })),
  );
page
  .command("press <profile> <key>")
  .addOption(pageOpt)
  .action((ref: string, key: string, opts: { page?: string }) =>
    withPage((api) => api.press(ref, { key, pageId: opts.page })),
  );
page
  .command("screenshot <profile>")
  .addOption(pageOpt)
  .option("-o, --output <file>", "output file", "screenshot.png")
  .option("--full", "full page")
  .action(async (ref: string, opts: { page?: string; output: string; full?: boolean }) => {
    const shot = await (await client()).screenshot(ref, { pageId: opts.page, fullPage: opts.full });
    writeFileSync(opts.output, Buffer.from(shot.data, "base64"));
    out({ pageId: shot.pageId, file: opts.output }, () => console.log(`saved ${opts.output}`));
  });
page
  .command("eval <profile> <expression>")
  .addOption(pageOpt)
  .action((ref: string, expression: string, opts: { page?: string }) =>
    withPage((api) => api.evaluate(ref, { expression, pageId: opts.page })),
  );

// ── workflows ──────────────────────────────────────────────────────────────

const workflow = program
  .command("workflow")
  .alias("workflows")
  .description("manage reusable workflows");

workflow
  .command("ls")
  .description("list workflows")
  .action(async () => {
    const list = await (await client()).listWorkflows();
    out(list, () =>
      table(
        list.map((w) => ({
          name: w.name,
          id: w.id,
          version: w.version,
          steps: w.stepCount,
          params: Object.keys(w.params).join(",") || null,
          updated: w.updatedAt,
        })),
      ),
    );
  });

workflow
  .command("show <workflow>")
  .description("show a workflow definition")
  .action(async (ref: string) => out((await (await client()).getWorkflow(ref)).definition));

workflow
  .command("save <file>")
  .description("save a workflow definition from a JSON file ('-' reads stdin)")
  .action(async (file: string) => {
    const text = readFileSync(file === "-" ? 0 : file, "utf8");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new PpbError(
        "INVALID_INPUT",
        `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const parsed = workflowDefinitionSchema.safeParse(data);
    if (!parsed.success) {
      throw new PpbError("INVALID_INPUT", parsed.error.message);
    }
    const w = await (await client()).saveWorkflow(parsed.data);
    out(w, () => console.log(`saved ${w.name} v${w.version}`));
  });

workflow
  .command("rm <workflow...>")
  .description("delete workflows")
  .action(async (refs: string[]) => {
    for (const ref of refs) await (await client()).deleteWorkflow(ref);
    console.log(`deleted ${refs.join(", ")}`);
  });

workflow
  .command("run <workflow> <profile>")
  .description("run a workflow on a profile")
  .option(
    "-p, --param <key=value>",
    "parameter (repeatable)",
    (v: string, prev: Record<string, string>) => {
      const i = v.indexOf("=");
      if (i === -1) throw new InvalidArgumentError("expected key=value");
      return { ...prev, [v.slice(0, i)]: v.slice(i + 1) };
    },
    {} as Record<string, string>,
  )
  .option("--page <pageId>", "run on this existing page")
  .option("--keep-page", "keep the page after the run")
  .option("--headed", "visible window when starting the profile")
  .option("--screenshots <dir>", "directory to save screenshots", ".")
  .action(
    async (
      wfRef: string,
      profileRef: string,
      opts: {
        param: Record<string, string>;
        page?: string;
        keepPage?: boolean;
        headed?: boolean;
        screenshots: string;
      },
    ) => {
      const result = await (
        await client()
      ).runWorkflow(wfRef, {
        profile: profileRef,
        params: opts.param,
        pageId: opts.page,
        keepPage: opts.keepPage,
        headless: opts.headed ? false : undefined,
      });
      if (result.screenshots.length > 0) mkdirSync(opts.screenshots, { recursive: true });
      for (const shot of result.screenshots) {
        const path = join(opts.screenshots, `${wfRef}-${shot.stepId}.png`);
        writeFileSync(path, Buffer.from(shot.data, "base64"));
        shot.data = path;
      }
      out(result);
      if (result.status !== "succeeded") process.exitCode = 1;
    },
  );

workflow
  .command("record-start <profile>")
  .description("start recording actions on a profile")
  .action(async (ref: string) => {
    await (await client()).startRecording(ref);
    console.log(`recording ${ref}`);
  });

workflow
  .command("record-stop <profile>")
  .description("stop recording and return the steps")
  .option("--name <name>", "emit a full workflow skeleton with this name")
  .option("-o, --output <file>", "write to a file instead of stdout")
  .action(async (ref: string, opts: { name?: string; output?: string }) => {
    const result = await (await client()).stopRecording(ref);
    for (const w of result.warnings) console.error(`warning: ${w}`);
    const payload = opts.name
      ? { name: opts.name, params: {}, steps: result.steps }
      : { steps: result.steps, warnings: result.warnings };
    const json = JSON.stringify(payload, null, 2);
    if (opts.output) writeFileSync(opts.output, json);
    else console.log(json);
  });

try {
  await program.parseAsync();
} catch (error) {
  const message =
    error instanceof PpbError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : String(error);
  console.error(`error: ${message}`);
  process.exitCode = 1;
}
