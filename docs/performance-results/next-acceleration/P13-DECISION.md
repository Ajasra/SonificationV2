# P13 — Export and rollout decision

Status: **desktop smoke test passed; export and device rollout remain open**.

## Verified here

The desktop Chromium benchmark-browser test generated and decoded a 1280×720, 30 fps WebM fixture, ran the reference browser benchmark, and downloaded an attributed JSON report. It passed as part of `npx playwright test tests/browser/benchmark.spec.ts tests/browser/worker-probe.spec.ts`; the benchmark spec completed in 25 seconds. This validates the benchmark source/report workflow, not the application's offline MP4 export.

The same command's WASM browser-pipeline and disabled-control tests passed. Application GPU integration began and emitted capture diagnostics during `npm run test:gpu`, but the full group did not complete; no P13 acceptance claim is based on that partial run.

## Not verified

No local test currently establishes offline MP4 pixel/sample parity, timestamps, abort behavior, or isolation of live filter history. No 300-second camera/file pair, 20-cycle lifecycle run, Android/iPhone device session, HTTPS deployment asset check, or cache/fallback rollout matrix was performed. Those results cannot be inferred from a desktop benchmark report or headless browser.

## Decision

Do not enable accelerated export or declare device rollout support. Keep export on its existing reference path. Close P13 only after the offline export contract has dedicated deterministic tests, sustained sessions complete on named devices, and the passed capability matrix can be tied to deployed asset versions and tested fallback behavior.
