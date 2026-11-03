import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { CoreService, ensureDirs, type Paths } from "@ppb/core";
import { createServer } from "@ppb/server";
import { DEFAULT_PORT, PpbClient } from "@ppb/shared";
import * as z from "zod";

export interface DaemonInfo {
  pid: number;
  host: string;
  port: number;
  version: string;
  startedAt: string;
}

const daemonInfoSchema = z.object({
  pid: z.number(),
  host: z.string(),
  port: z.number(),
  version: z.string(),
  startedAt: z.string(),
});

export interface DaemonOptions {
  host: string;
  port: number;
  maxRunning: number;
}

/** Reads or creates the API token shared by the CLI, web UI and MCP clients. */
export function loadToken(paths: Paths): string {
  ensureDirs(paths);
  if (existsSync(paths.token)) return readFileSync(paths.token, "utf8").trim();
  const token = randomBytes(24).toString("base64url");
  writeFileSync(paths.token, `${token}\n`, { mode: 0o600 });
  return token;
}

export function readDaemonInfo(paths: Paths): DaemonInfo | null {
  if (!existsSync(paths.daemon)) return null;
  const parsed = daemonInfoSchema.safeParse(JSON.parse(readFileSync(paths.daemon, "utf8")));
  if (!parsed.success || !isAlive(parsed.data.pid)) return null;
  return parsed.data;
}

export function daemonUrl(info: Pick<DaemonInfo, "host" | "port">): string {
  return `http://${info.host.includes(":") ? `[${info.host}]` : info.host}:${info.port}`;
}

/** Runs the daemon in the foreground until SIGINT/SIGTERM. */
export async function runDaemon(
  paths: Paths,
  version: string,
  options: DaemonOptions,
): Promise<void> {
  const running = readDaemonInfo(paths);
  if (running && running.pid !== process.pid) {
    throw new Error(`Daemon already running (pid ${running.pid}) at ${daemonUrl(running)}`);
  }
  const token = loadToken(paths);
  const service = new CoreService({ paths, version, maxRunning: options.maxRunning });
  const app = await createServer({
    service,
    version,
    token,
    host: options.host,
    webRoot: findWebRoot(),
  });
  await app.listen({ host: options.host, port: options.port });
  const info: DaemonInfo = {
    pid: process.pid,
    host: options.host,
    port: options.port,
    version,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(paths.daemon, JSON.stringify(info, null, 2), { mode: 0o600 });
  console.error(`ppb daemon ${version} listening on ${daemonUrl(info)} (pid ${process.pid})`);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    await service.shutdown();
    if (readDaemonInfo(paths)?.pid === process.pid) rmSync(paths.daemon, { force: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

/** Returns a client for the running daemon, starting it in the background when needed. */
export async function connect(paths: Paths, options: DaemonOptions): Promise<PpbClient> {
  const token = loadToken(paths);
  const existing = readDaemonInfo(paths);
  if (existing) return new PpbClient({ baseUrl: daemonUrl(existing), token });

  const log = openSync(paths.log, "a");
  const child = spawn(
    process.execPath,
    [
      ...process.execArgv,
      process.argv[1]!,
      "daemon",
      "run",
      "--host",
      options.host,
      "--port",
      String(options.port),
      "--max-running",
      String(options.maxRunning),
    ],
    { detached: true, stdio: ["ignore", log, log], env: process.env },
  );
  child.unref();

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await sleep(200);
    const info = readDaemonInfo(paths);
    if (!info) {
      if (child.exitCode !== null) break;
      continue;
    }
    const client = new PpbClient({ baseUrl: daemonUrl(info), token });
    try {
      await client.status();
      return client;
    } catch {
      // listening is written before the socket is fully ready on slow machines; retry
    }
  }
  throw new Error(`Daemon failed to start; see ${paths.log}`);
}

export async function stopDaemon(paths: Paths): Promise<boolean> {
  const info = readDaemonInfo(paths);
  if (!info) return false;
  process.kill(info.pid, "SIGTERM");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && isAlive(info.pid)) await sleep(100);
  return true;
}

export const DEFAULT_DAEMON: DaemonOptions = {
  host: "127.0.0.1",
  port: DEFAULT_PORT,
  maxRunning: 20,
};

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Built CLI ships the UI at dist/web; running from source uses apps/web/dist. */
function findWebRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  return (
    [join(here, "web"), join(here, "..", "..", "web", "dist")].find((dir) =>
      existsSync(join(dir, "index.html")),
    ) ?? null
  );
}
