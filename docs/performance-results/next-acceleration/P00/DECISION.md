# P00 baseline and attribution checkpoint

Status: **in progress**. Harness options and suite isolation are implemented; clean-revision full-path baselines and CPU/WASM app-route comparisons remain open. Nothing here closes 720p30 acceptance.

## Harness changes under test

The application GPU runner now accepts explicit profiling, audio state, output volume, HUD, declared source cadence and manual device label settings. The downloaded report records requested settings alongside actual audio/mute/HUD state. Detailed WebGPU timing is off by default for performance acceptance and remains available on demand for diagnostics. Browser integration asserts the new report metadata.

## Diagnostic run `3ebf439a-b637-464f-b0e2-f8693ba91dc2`

Raw report: [app-benchmark-3ebf439a-b637-464f-b0e2-f8693ba91dc2.json](app-benchmark-3ebf439a-b637-464f-b0e2-f8693ba91dc2.json).

| Field | Observation |
|---|---|
| Source | `test_60fps.mov`, 1280×720 H.264, SHA-256 `d86a2c31d29b1e175d4ddf165b1107809b50c60e2b40f0b8c5dadaca87da77e7`; fresh ffprobe reports 60/1 nominal and average rate, duration 119.98 seconds |
| Runtime / adapter | Headless Chrome on Windows x64; AMD GCN-5 reported, device name unavailable |
| Build | `d48b74099e3ce0b6f5c7e67006b57a22800966bc`; dirty checkout. Vite served working-tree source, but the report identifies only the prior Git commit and a dirty bit, not an immutable source hash |
| Actual conditions | GPU TapeSat, texture capture, fused path, validation on, detailed profiling off, audio context running and unmuted at volume 0.25, HUD on |
| Measured | 59.96 seconds; 38.32 processed fps; frame p50/p95/p99 9.6/27.0/52.3 ms; GPU completion/readback p50/p95/p99 9.2/25.0/49.5 ms; 292 missed callback proxy events |
| Correctness | Sample and resident fidelity passed; app remained on GPU, with no report error |
| Actual runner arguments | PowerShell `npm run` stripped named CLI options; run used default 60-second duration and unknown device/source cadence, despite requested 5 seconds / 60 fps / label. The source cadence was independently verified below, but the run did not record that fact. This run is therefore diagnostic only. |

Throughput exceeds 29.4 fps for this high-cadence synthetic test, while p95 misses the ≤25 ms processing budget. Callback gaps cannot separate decode and application drops. GPU identity remains partially known. No 30 fps acceptance claim follows.

## Argument/report smoke run `6e61db34-10fa-4aec-bf5f-ed0e93c71714`

The direct Node invocation passed all new options and the report matched them: profiled, active audio at volume 0.1, HUD on, declared 60 fps and the supplied AMD GCN-5 label. It measured only 6.49 seconds/24 frames, so this is a harness check, not a benchmark. Sample/resident fidelity passed and texture capture passed its preflight. Profiling produced 397 internal readback-map samples across warmup and measurement, versus 24 acceptance-window frames. The frame p95 was 287.5 ms and throughput 3.70 fps. These diagnostic spans cannot be compared with unprofiled performance as a causal A/B; profile-off remains the acceptance mode. Raw report is adjacent.

The updated Playwright application integration test passed in 21.8 seconds and verified report condition fields plus GPU fidelity and JS fallback across format/resolution changes. On its generated video fixture the exact texture probe differed by up to two pixel byte levels, so the app correctly chose reference-byte capture. This demonstrates source-sensitive capture fallback on AMD; the separate 60 fps file run selected texture capture. The test is functional, not a sustained benchmark.

## Regression and suite checkpoint

- `npm run build`: passed.
- `npm test`: 69 passed, 0 failed.
- `npm run test:wasm`: 9 passed, 0 failed.
- Focused application GPU browser test: 1 passed (21.8 s).
- `npm run test:gpu`: 8 passed across three serial Playwright processes. The earlier single-process run stalled at final compact handoff without respecting the test timeout. Running the app tests, five WebGPU tests, then state handoff in a new Chrome process completed; the final handoff test took 4.3 s. The runner now saves one JSON report per process. Its last report is `test-results/gpu-browser-report-handoff.json`.
- `git diff --check`: passed before this update.

This supports process isolation as a workaround; it does not prove the underlying cause of the original GPU/browser hang.

## Remaining P00 gate

1. Add real JS/WASM application-run controls and an API-observed transfer ledger before claiming equal-backend app comparisons; the current WASM harness remains synthetic-canvas CPU-path scope.
2. After committing the final harness revision, rerun a named, profiled-off 60-second source-verified diagnostic and preserve its revision/hash. The current unprofiled app run used the prior HEAD with a dirty working tree.

P01 can diagnose capture on this AMD adapter after a clean fresh-revision run. `texture` selection passed its current file preflight and the app also correctly rejected the generated video fixture; reference-byte/upload remains a source-specific accuracy fallback and needs a matched per-source A/B before choosing an app route.
