# Changelog

All notable changes to pp-browser are documented here. Each section becomes a GitHub Release's notes.

<!-- `vp run version-packages` adds each release's section from its changesets; edit it in the Version Packages PR. -->

## [0.1.0] — 2026-11-03

First release.

- `ppb` CLI and background daemon: multi-profile Camoufox browser manager with per-profile fingerprints, proxies, and persistent storage.
- Web UI (`ppb ui`) for managing profiles and proxies.
- MCP server (stdio and HTTP) and REST API so agents can drive pages across profiles.
- Desktop app (macOS, Windows, Linux) bundling the daemon and web UI for people who don't want a terminal.
