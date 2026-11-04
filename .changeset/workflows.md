---
"@ppb/cli": minor
---

Add workflows: package a sequence of browser steps (goto, click, type, wait, extract, if/switch with optional steps and per-step failure handling) so agents replay it in a later session instead of relearning the site. Create them by recording an agent session, having an agent write one, or importing JSON. Run them with `run_workflow`, `ppb workflow run`, or the new Workflows page in the web UI.
