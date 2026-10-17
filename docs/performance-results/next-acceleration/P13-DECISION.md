# P13 — Export and rollout decision

Status: **offline export isolation smoke test passed; export fidelity and device rollout remain open**.

## Verified here

The local `offline-export.spec.ts` now generates a changing 64×48 WebM source, exports AVC MP4 through `OfflineVideoRecorder`, and verifies `video/mp4`/`ftyp`, non-empty output, progress, recorder shutdown and source-time restoration. It injects a fresh export pipeline and confirms that its TapeSat history advances while the live pipeline history remains byte-for-byte unchanged. The latest full local automation passed this browser test. This closes the previously absent regression for live-history isolation and basic MP4 finalization.

The test does not decode and compare output pixels/audio samples/timestamps against a reference, nor exercise cancellation or repeated export. It runs in desktop Chromium and is a small deterministic fixture, not an export-quality or throughput acceptance result.

The desktop Chromium benchmark-browser test generated and decoded a 1280×720, 30 fps WebM fixture, ran the reference browser benchmark, and downloaded an attributed JSON report. It passed as part of `npx playwright test tests/browser/benchmark.spec.ts tests/browser/worker-probe.spec.ts`; the benchmark spec completed in 25 seconds. This validates the benchmark source/report workflow, not the application's offline MP4 export.

Earlier partial test attempts above are historical. The latest split local automation completed all GPU groups and the offline-export test successfully; see [the full automation ledger](automated-runs/2026-10-14T023028-816Z-50ab7305.json).

## Not verified

The five-minute headed GPU file session is recorded under P00, but it is not a camera run. Offline MP4 pixel/sample parity, timestamps, abort behavior, repeated-export lifecycle, 20-cycle lifecycle run, Android/iPhone device session, HTTPS deployment asset check, and cache/fallback rollout matrix remain untested. Those results cannot be inferred from a desktop benchmark report or headed browser.

## Decision

Do not enable accelerated export or declare device rollout support. The isolated pipeline fix and MP4-finalization regression are suitable to retain. Keep export on its reference path until deterministic output parity/cancellation checks pass, sustained sessions complete on named devices, and the capability matrix is tied to deployed asset versions and tested fallback behavior.
