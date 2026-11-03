# PP Browser

Multi-profile anti-detect browser manager. Each profile has its own persistent fingerprint, cookies/storage and proxy, and runs as a separate [Camoufox](https://camoufox.com) (Firefox) process. Manage profiles from the `ppb` CLI, a local web UI, or let agents drive them over MCP / REST.

Download the desktop app from the [Releases](https://github.com/pp-techs/pp-browser/releases) page, or build from source below.

## Requirements

- Node.js ≥ 24 (uses built-in `node:sqlite` and TypeScript type stripping)
- [Vite+](https://viteplus.dev) (`vp`) and pnpm for development

## Quick start

```bash
vp install
vp run build                       # builds apps/web then bundles apps/cli (dist/main.mjs + dist/web)
alias ppb="node $PWD/apps/cli/dist/main.mjs"

ppb setup                           # downloads the pinned Camoufox build + GeoLite2 DB (~700 MB, once)
ppb proxy add 'socks5://user:pass@1.2.3.4:1080' --name us-1
ppb proxy check us-1
ppb profile create fb-01 --proxy us-1 --group marketing
ppb open fb-01                      # visible window
ppb ui                              # web UI at http://127.0.0.1:7777
```

Any command starts the background daemon on demand (`ppb daemon start|stop`, logs in `~/.ppb/daemon.log`). From source without building: `node apps/cli/src/main.ts …`.

## Desktop app

`apps/desktop` wraps the daemon and web UI in a Tauri shell for people who don't want a terminal: double-click to open, no Node/pnpm/Camoufox install required.

```bash
cd apps/desktop
pnpm tauri build          # -> src-tauri/target/release/bundle/{macos,dmg,...}
```

`scripts/prepare.mjs` (run automatically via `beforeBuildCommand`/`beforeDevCommand`) deploys `@ppb/cli` with its production dependencies into `src-tauri/resources/ppb` (`pnpm deploy --config.node-linker=hoisted`, since Tauri's bundler does not follow pnpm's symlinked `node_modules`) and downloads the matching [Bun](https://bun.sh) release binary into `src-tauri/binaries/` as the sidecar runtime. On launch the app spawns `bun resources/ppb/dist/main.mjs daemon run`, waits for `~/.ppb/daemon.json`, then points the window at the daemon's URL with the token — the same flow as `ppb ui`. Closing the window sends the daemon `SIGTERM` for a graceful shutdown. `pnpm tauri dev` runs the same flow against a debug build.

## Commands

| Area        | Commands                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Profiles    | `ppb profile ls\|create\|show\|edit\|rm`, `ppb open`, `ppb start [--headless]`, `ppb stop [--all]`, `ppb ps` |
| Proxies     | `ppb proxy ls\|add\|import <file\|->\|edit\|rm\|check`                                                       |
| Pages       | `ppb page ls\|new\|close\|goto\|snapshot\|click\|type\|press\|screenshot\|eval`                              |
| Integration | `ppb mcp` (stdio), `ppb token`, `ppb ui`, `ppb status`, `ppb daemon run\|start\|stop`                        |

Profiles and proxies accept an id or a name everywhere. Add `--json` for machine-readable output.

Proxy formats: `http|https|socks4|socks5://[user:pass@]host:port`, `host:port`, `host:port:user:pass`.

## Agents

**MCP over stdio** (Claude Desktop/Code, Cursor):

```json
{ "mcpServers": { "ppb": { "command": "ppb", "args": ["mcp"] } } }
```

**MCP over HTTP**: `POST http://127.0.0.1:7777/mcp` with `Authorization: Bearer $(ppb token)`.

Tools: `list_profiles`, `get_profile`, `create_profile`, `start_profile`, `stop_profile`, `list_proxies`, `check_proxy`, `list_pages`, `new_page`, `close_page`, `navigate`, `snapshot`, `click`, `type`, `press`, `wait_for`, `screenshot`, `evaluate`. Every page tool takes a `profile`, so one agent can drive many profiles in parallel. `snapshot` returns an accessibility tree whose `[ref=e12]` / `[ref=f1e5]` refs are valid `target`s for `click` / `type`; page-changing tools return a fresh snapshot.

**REST**: the same operations under `/api` (see `packages/shared/src/client.ts` for the route list), bearer token required.

## How it works

- **Identity**: at creation a profile gets a BrowserForge fingerprint (Firefox, chosen OS), a WebGL vendor/renderer pair and the Camoufox seeds (canvas, audio, font spacing). They are stored and replayed on every launch, so the profile looks like the same device each time.
- **Geo**: on launch the exit IP is resolved through the proxy; timezone, geolocation, WebRTC IP and locale follow it. The locale is pinned per exit country.
- **Proxy forwarder**: each running profile gets a loopback proxy chaining to its upstream (auth and SOCKS supported). If the upstream dies, requests fail (`NS_ERROR_PROXY_CONNECTION_REFUSED`) instead of leaking the real IP. Launch is refused with `PROXY_DOWN` when the proxy is unreachable.
- **Isolation**: each profile has its own Firefox `user-data-dir` under `~/.ppb/profiles/<id>`.
- **macOS hosts**: Camoufox's macOS build draws text in its bundled Windows/Linux fonts (Segoe UI, Calibri, Cambria, Consolas…) with the wrong glyphs in _visible_ windows ([daijro/camoufox#918](https://github.com/daijro/camoufox/issues/918)); headless rendering and screenshots are correct. On macOS `ppb profile create` therefore defaults to a macOS fingerprint, and the UI/CLI flag Windows/Linux profiles as "headless only".
- **Limits**: `ppb daemon run --max-running N` (default 20). `ppb ps` / the UI show per-profile memory (RSS of the process tree; shared pages are counted per profile, so totals over-estimate). Expect roughly 1–1.5 GB per running profile.
- **Security**: the daemon binds `127.0.0.1`, checks `Host`/`Origin` against DNS rebinding and requires the bearer token in `~/.ppb/token` (mode 0600) for `/api` and `/mcp`. Proxy credentials are stored in `~/.ppb/ppb.db`.

Data directory: `~/.ppb` (override with `PPB_HOME`).

## Layout

```
apps/cli         ppb CLI + daemon entry (vp pack → dist/main.mjs, ships the web UI in dist/web)
apps/web         React web UI: TanStack Router (file-based, nested under src/routes) + Astryx components/theme (vp build)
apps/desktop     Tauri shell bundling the daemon (Bun sidecar) + web UI as a double-clickable app
packages/shared  API types, zod schemas, proxy URL parsing, HTTP client
packages/core    SQLite store, Camoufox engine, proxy forwarder, runtime sessions
packages/mcp     MCP tool definitions over the shared PpbApi interface
packages/server  Fastify REST + MCP Streamable HTTP + static UI
```

## Development

```bash
vp check            # format, lint, type-check
vp run -r test
vp run -r build
vp run dev:web      # UI dev server; proxies /api and /mcp to the daemon on :7777
```

`playwright-core` is pinned to 1.62.x: `camoufox-js` 0.13 requires `<1.63` because Playwright's Juggler client must match the Camoufox build.

## Releases

Releases are driven by [Changesets](https://github.com/changesets/changesets): add a changeset with `vp run changeset` for any change users will notice, then maintainers merge the "Version Packages" PR to release. See [docs/release-process.md](docs/release-process.md).
