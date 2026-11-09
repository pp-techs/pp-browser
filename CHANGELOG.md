# Changelog

All notable changes to pp-browser are documented here. Each section becomes a GitHub Release's notes.

<!-- `vp run version-packages` adds each release's section from its changesets; edit it in the Version Packages PR. -->

## [0.3.1] — 2026-11-09

Adding several proxies that share a gateway host:port but differ in credentials (rotating pools, per-session or per-country logins) no longer fails with "name is already taken": each line now gets the next free default name (`host-port`, `host-port-2`, …) when importing or adding without a name.

## [0.3.0] — 2026-11-04

Move to the official `camoufox` package and Camoufox 158.0.1 (beta.41), up from camoufox-js 0.13 and Firefox 152. `ppb setup` downloads the new browser build (about 1.3 GB). An existing profile gets a new fingerprint the first time it is launched after the update; its cookies and browsing data are kept, but sites will see a different device.

Add workflows: package a sequence of browser steps (goto, click, type, wait, extract, if/switch with optional steps and per-step failure handling) so agents replay it in a later session instead of relearning the site. Create them by recording an agent session, having an agent write one, or importing JSON. Run them with `run_workflow`, `ppb workflow run`, or the new Workflows page in the web UI.

## [0.2.0] — 2026-11-03

Fix the desktop app showing "404 Not Found" on launch when an older or web-less ppb daemon was already running. The app now replaces a daemon that is a different version or cannot serve the UI, and waits for the daemon it started itself.

Name the app **PP Browser** and move the color theme picker out of the top bar into a Settings dialog, opened from the sidebar, with Appearance and About sections.

## [0.1.0] — 2026-11-03

First release.

- `ppb` CLI and background daemon: multi-profile Camoufox browser manager with per-profile fingerprints, proxies, and persistent storage.
- Web UI (`ppb ui`) for managing profiles and proxies.
- MCP server (stdio and HTTP) and REST API so agents can drive pages across profiles.
- Desktop app (macOS, Windows, Linux) bundling the daemon and web UI for people who don't want a terminal.
