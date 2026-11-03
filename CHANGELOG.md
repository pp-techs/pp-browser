# Changelog

All notable changes to pp-browser are documented here. Each section becomes a GitHub Release's notes.

<!-- `vp run version-packages` adds each release's section from its changesets; edit it in the Version Packages PR. -->

## [0.2.0] — 2026-11-03

Fix the desktop app showing "404 Not Found" on launch when an older or web-less ppb daemon was already running. The app now replaces a daemon that is a different version or cannot serve the UI, and waits for the daemon it started itself.

Name the app **PP Browser** and move the color theme picker out of the top bar into a Settings dialog, opened from the sidebar, with Appearance and About sections.

## [0.1.0] — 2026-11-03

First release.

- `ppb` CLI and background daemon: multi-profile Camoufox browser manager with per-profile fingerprints, proxies, and persistent storage.
- Web UI (`ppb ui`) for managing profiles and proxies.
- MCP server (stdio and HTTP) and REST API so agents can drive pages across profiles.
- Desktop app (macOS, Windows, Linux) bundling the daemon and web UI for people who don't want a terminal.
