import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Paths {
  root: string;
  db: string;
  profiles: string;
  token: string;
  daemon: string;
  log: string;
}

/** Data lives in `$PPB_HOME` (default `~/.ppb`); owner-only permissions since it holds credentials and sessions. */
export function resolvePaths(root = process.env.PPB_HOME || join(homedir(), ".ppb")): Paths {
  return {
    root,
    db: join(root, "ppb.db"),
    profiles: join(root, "profiles"),
    token: join(root, "token"),
    daemon: join(root, "daemon.json"),
    log: join(root, "daemon.log"),
  };
}

export function ensureDirs(paths: Paths): void {
  mkdirSync(paths.profiles, { recursive: true, mode: 0o700 });
}

export function profileDir(paths: Paths, profileId: string): string {
  return join(paths.profiles, profileId);
}
