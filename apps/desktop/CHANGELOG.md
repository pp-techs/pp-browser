# @ppb/desktop

## 0.3.1

### Patch Changes

- b8395a8: Adding several proxies that share a gateway host:port but differ in credentials (rotating pools, per-session or per-country logins) no longer fails with "name is already taken": each line now gets the next free default name (`host-port`, `host-port-2`, …) when importing or adding without a name.

## 0.3.0

No changes in this release.

## 0.2.0

### Minor Changes

- afafca8: Name the app **PP Browser** and move the color theme picker out of the top bar into a Settings dialog, opened from the sidebar, with Appearance and About sections.

### Patch Changes

- 1744748: Fix the desktop app showing "404 Not Found" on launch when an older or web-less ppb daemon was already running. The app now replaces a daemon that is a different version or cannot serve the UI, and waits for the daemon it started itself.
