---
"@ppb/cli": minor
---

Move to the official `camoufox` package and Camoufox 158.0.1 (beta.41), up from camoufox-js 0.13 and Firefox 152. `ppb setup` downloads the new browser build (about 1.3 GB). An existing profile gets a new fingerprint the first time it is launched after the update; its cookies and browsing data are kept, but sites will see a different device.
