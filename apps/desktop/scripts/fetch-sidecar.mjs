#!/usr/bin/env node
// Downloads the official Bun release binary and places it under src-tauri/binaries/
// with the target-triple suffix Tauri's sidecar mechanism requires. Cross-platform: uses
// Node's fetch and adm-zip rather than curl/unzip, which Windows runners lack.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const BUN_VERSION = "1.4.4";

const here = dirname(fileURLToPath(import.meta.url));
const binariesDir = join(here, "..", "src-tauri", "binaries");

// The host triple: native per-arch runners make this the build target too (see
// docs/release-process.md — cross-compiling would need the *target* triple instead).
const triple = execFileSync("rustc", ["--print", "host-tuple"]).toString().trim();

// Map Rust target triples to Bun's release asset names.
const BUN_ASSET_BY_TRIPLE = {
  "aarch64-apple-darwin": "bun-darwin-aarch64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-aarch64",
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
};

const asset = BUN_ASSET_BY_TRIPLE[triple];
if (!asset) {
  console.error(`No Bun release asset mapped for target triple "${triple}".`);
  process.exit(1);
}

const isWindows = triple.includes("windows");
const ext = isWindows ? ".exe" : "";
const destName = `bun-${triple}${ext}`;
const dest = join(binariesDir, destName);

if (existsSync(dest)) {
  console.log(`Sidecar already present: ${dest}`);
  process.exit(0);
}

mkdirSync(binariesDir, { recursive: true });

const zipUrl = `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${asset}.zip`;
const tmpZip = join(binariesDir, `${asset}.zip.tmp`);
const tmpDir = join(binariesDir, `${asset}.tmp`);

console.log(`Downloading ${zipUrl} ...`);
const response = await fetch(zipUrl);
if (!response.ok) {
  console.error(`Download failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}
writeFileSync(tmpZip, Buffer.from(await response.arrayBuffer()));
rmSync(tmpDir, { recursive: true, force: true });
new AdmZip(tmpZip).extractAllTo(tmpDir, true);

const extractedBin = join(tmpDir, asset, isWindows ? "bun.exe" : "bun");
renameSync(extractedBin, dest);
if (!isWindows) chmodSync(dest, 0o755);

rmSync(tmpZip, { force: true });
rmSync(tmpDir, { recursive: true, force: true });

console.log(`Sidecar ready: ${dest}`);
