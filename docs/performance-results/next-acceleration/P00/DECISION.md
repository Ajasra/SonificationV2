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

## Committed-revision diagnostic run `e0b3eba7-e7fd-476e-b4be-0daa832741e9`

Raw report: [app-benchmark-e0b3eba7-e7fd-476e-b4be-0daa832741e9.json](app-benchmark-e0b3eba7-e7fd-476e-b4be-0daa832741e9.json).

On revision `3917d2ca27e06a9996c23a6d8eed49efc2006cf3`, the same 1280×720 60 fps source ran for 60.27 measured seconds with GPU validation on, fused dispatch on, profiling off, audio active at volume 0.25, HUD on and texture capture selected. AMD GCN-5 was identified; the adapter model remains unknown. Fidelity passed. Throughput was 37.51 fps; frame-path p50/p95/p99 9.6/24.6/35.8 ms; GPU completion/readback p50/p95/p99 9.1/22.5/33.7 ms; 236 presented-callback gap proxy events. This meets the measured ≥29.4 throughput and ≤25 ms p95 on this headless high-cadence setup. The one-second p95 margin is narrow, and the 60 fps clip plus callback proxy cannot close exact 30 fps source/drop acceptance. The Vite report still marks the tree dirty; the commit revision is explicit, but the runner's dirty flag needs reconciliation before claiming an immutable clean build.

## Verified-cadence 30 fps run `9f67c4cd-2c9d-4697-8d5d-ef1fb433c785`

Raw report: [app-benchmark-9f67c4cd-2c9d-4697-8d5d-ef1fb433c785.json](app-benchmark-9f67c4cd-2c9d-4697-8d5d-ef1fb433c785.json). The source was generated from the repository's 1280×720 file with FFmpeg `fps=30`, independently verified as 30/1 nominal and average rate, and SHA-256 `8a3bed3a381a76f9c8dd81d6ffa9045272c285212417671119a7fed8cc6ae008`. A 60-second headless Chrome run on AMD GCN-5 used active audio at volume 0.25, HUD on, validation on, fused processing on, and profile off. It processed 1,774 frames in 59.94 seconds: 29.60 fps; frame-path p50/p95/p99 10.0/15.4/36.5 ms. The compact completion/readback p50/p95/p99 was 9.6/15.0/36.0 ms. Fidelity passed, and automatic capture selected the texture path. The callback-gap proxy counted one miss.

This meets the numeric 720p30 throughput and p95 thresholds in this **headless GPU TapeSat cohort**. It is not visible-display proof, does not compare JS/WASM application routes, and is not a named-model device sign-off. Its `build.dirty=true` was later traced to Vite's temporary config bundle; P00 now records the dirty paths and excludes only that known generated file.

## Clean-provenance 30 fps confirmation `80c46eaf-c1e6-41a2-9fe0-b7c1f02e6fcb`

Raw report: [app-benchmark-80c46eaf-c1e6-41a2-9fe0-b7c1f02e6fcb.json](app-benchmark-80c46eaf-c1e6-41a2-9fe0-b7c1f02e6fcb.json). It used the same verified 30 fps source hash and settings on clean revision `d06c756c250a5b773fccf0a59c79c2915a376aba`; build `dirty=false`. In 59.91 measured seconds it processed 1,796 frames: 29.98 fps; frame-path p50/p95/p99 9.7/13.1/18.3 ms; completion/readback p50/p95/p99 9.3/12.6/18.0 ms. There were zero missed-presented-callback proxy events. Fidelity passed, capture mode was texture, audio was active and HUD was on.

This closes the clean-build headless 720p30 GPU TapeSat numeric gate on the named AMD GCN-5 adapter family. It still does not prove the physical display/audio path or a phone cohort.

## Regression and suite checkpoint

- `npm run test:acceleration`: passed all 8 serial local gates on clean revision `d06c756c250a5b773fccf0a59c79c2915a376aba`; 72 Node tests, 11 WASM conformance tests, both builds, benchmark/worker browser tests, app-GPU integration, eight GPU kernel/temporal tests and compact monitor/state handoff. Run report: `automated-runs/2026-10-14T014418-659Z-7260f8dd.json` (the next run is rerun after committing this P00 report to make the tree clean at start).
- The original suite stall was transient/process-sensitive; current split runner completed every GPU group. Process isolation remains the reliable configuration.
- A clean-provenance 60-second headless app run on a verified 30 fps source passed numeric throughput and p95 gates with fidelity, texture capture, active audio and HUD on.
- `git diff --check`: passed before this update.

This supports process isolation as a workaround; it does not prove the underlying cause of the original GPU/browser hang.

## Remaining P00 gate

1. Add equivalent JS/WASM application-run controls and an API-observed transfer ledger before claiming equal-backend app comparisons; the current WASM harness remains synthetic-canvas CPU-path scope.
2. Run a visible-browser and physical-device 60-second test on the verified 30 fps source, then camera and sustained sessions.

P01 can diagnose capture on this AMD adapter after a clean fresh-revision run. The clean 30 fps file selected texture with the existing resident fidelity gate; a distinct generated browser video fixture correctly fell back to reference bytes. Keep capture selection source-specific.
