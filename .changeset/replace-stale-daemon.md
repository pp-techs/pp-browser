---
"@ppb/desktop": patch
---

Fix the desktop app showing "404 Not Found" on launch when an older or web-less ppb daemon was already running. The app now replaces a daemon that is a different version or cannot serve the UI, and waits for the daemon it started itself.
