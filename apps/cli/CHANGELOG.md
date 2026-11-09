# @ppb/cli

## 0.3.1

No changes in this release.

## 0.3.0

### Minor Changes

- 6c14cf0: Move to the official `camoufox` package and Camoufox 158.0.1 (beta.41), up from camoufox-js 0.13 and Firefox 152. `ppb setup` downloads the new browser build (about 1.3 GB). An existing profile gets a new fingerprint the first time it is launched after the update; its cookies and browsing data are kept, but sites will see a different device.
- 6c14cf0: Add workflows: package a sequence of browser steps (goto, click, type, wait, extract, if/switch with optional steps and per-step failure handling) so agents replay it in a later session instead of relearning the site. Create them by recording an agent session, having an agent write one, or importing JSON. Run them with `run_workflow`, `ppb workflow run`, or the new Workflows page in the web UI.

## 0.2.0

No changes in this release.
