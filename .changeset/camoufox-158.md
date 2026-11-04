---
"@ppb/cli": minor
---

Move to the official `camoufox` package and Camoufox 158.0.1 (beta.41), up from camoufox-js 0.13 and Firefox 152. `ppb setup` downloads the new browser build (about 1.3 GB). Existing profiles get a new fingerprint once, the first time the daemon starts; cookies and browsing data are kept, but sites will see a different device.
