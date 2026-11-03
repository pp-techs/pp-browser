#!/usr/bin/env node
// Runs before `tauri dev` / `tauri build`: fetches the Bun sidecar binary and deploys
// the ppb CLI (daemon + web UI + its production node_modules) into src-tauri/resources
// so the desktop app can bundle and spawn it without requiring Node/Bun on the user's machine.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(here, "..", "..", "..");
const cliDist = join(workspaceRoot, "apps", "cli", "dist");
const deployDir = join(here, "..", "src-tauri", "resources", "ppb");

if (!existsSync(join(cliDist, "main.mjs"))) {
  console.error(`Missing ${cliDist}/main.mjs. Run "vp run @ppb/cli#build" first.`);
  process.exit(1);
}

rmSync(deployDir, { recursive: true, force: true });
// `pnpm deploy` flattens @ppb/cli's production dependencies (playwright-core,
// camoufox-js, fastify, ...) into deployDir/node_modules alongside its dist/, so the
// bundled sidecar binary can run `dist/main.mjs` with no workspace or Node install present.
// `node-linker=hoisted` avoids pnpm's symlinked node_modules layout: Tauri's resource
// bundler does not follow/copy those symlinks correctly (tauri-apps/tauri-docs#2708).
execFileSync(
  "pnpm",
  ["--filter", "@ppb/cli", "deploy", "--prod", "--config.node-linker=hoisted", deployDir],
  // `shell` on Windows resolves pnpm.cmd; arguments here are fixed strings.
  { cwd: workspaceRoot, stdio: "inherit", shell: process.platform === "win32" },
);
// Strip pnpm's remaining per-package .bin symlinks and internal metadata; nothing
// under dist/ references them, and a stray symlink is enough to break bundling.
for (const leftover of [".bin", ".pnpm", ".modules.yaml", ".pnpm-workspace-state-v1.json"]) {
  rmSync(join(deployDir, "node_modules", leftover), { recursive: true, force: true });
}
console.log(`Deployed @ppb/cli -> ${deployDir}`);

await import("./fetch-sidecar.mjs");
