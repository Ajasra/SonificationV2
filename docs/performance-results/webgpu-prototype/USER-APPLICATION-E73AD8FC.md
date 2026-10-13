# User application short run, 2026-10-13

Original: [app-benchmark-e73ad8fc-3f71-4bc9-8d0f-9cb2457b4761.json](app-benchmark-e73ad8fc-3f71-4bc9-8d0f-9cb2457b4761.json).

SHA-256: `9D1C742B21D57E4EFC95186C4BB9F7B0EDA3D73FA8CBD4A13A1D60A739B36FCA`. The preserved copy matches the Downloads original.

## Results

| Measurement | Result | Interpretation |
|---|---:|---|
| Source / resolution | Same MP4, 1280 × 720 | Same source hash as the previous run |
| Measured time / frames | 24.41 seconds / 240 GPU, 0 JS | Short sample; not a sustained acceptance run |
| Throughput | 9.83 fps | Severe regression from 27.67 fps in report 08f69665 |
| Frame path p50 / p95 / p99 | 83.4 / 86.9 / 88.2 ms | Far above the 25 ms target |
| Presented callback gaps | 489 | Large playback cadence loss |
| Capture p50 / p95 / p99 | 24.5 / 27.3 / 29.1 ms | About 3× the previous run's 8.1 / 10 / 11.5 ms |
| GPU completion/readback p50 / p95 / p99 | 61.8 / 65.4 / 66.6 ms | Includes the lazy CPU pixel capture; the stage is double-counted in the original report |
| Audio / HUD | Unmuted, context running, HUD enabled | Similar operating conditions to the previous run |
| Fidelity | Sample/resident passed; texture probe failed | Exact reference-byte fallback selected |
| Adapter identity | Blank | Hardware and driver cannot be compared |

The original report identifies revision `f103cbf8db997f2e3648a12edf2c8070cc4cf440` with `dirty: true`, rather than the source commit for the adaptive capture implementation. Treat its build provenance as incomplete. Its texture probe failed with 268 synthetic and 282 source-frame differing samples, maximum two-byte pixel error, so it correctly selected `reference-bytes`.

## Interpretation

This report confirms a real throughput regression on the tested run. It does not identify the cause: the adapter is unnamed, the report is short, and there are no matched power, thermal, or browser-load conditions. The GPU stage is not directly comparable to the previous report because lazy `getImageData()` ran inside `gpu.process()` and the old timing counted that same time under both capture and GPU completion. The overall frame-path latency, throughput, callback gaps, and capture timing still show the run was much slower.

The adaptive path exposed the live `willReadFrequently` canvas to WebGPU during the texture probe, then switched to byte capture after that probe failed. A changed canvas backing/readback cost is a plausible explanation for the capture increase, but this report alone cannot prove it. The follow-up keeps fidelity probing on a detached canvas and fixes stage attribution. Focused application tests and a production build pass; the performance effect needs a matched report from the same computer and source.

## Follow-up

Repeat the same 720p video and single TapeSat preset for at least 60 measured seconds after reloading the updated app. Keep audio and HUD settings the same. Compare capture p50/p95, GPU completion/readback p50/p95, overall frame path, processed FPS, and callback gaps. Include adapter details if the browser exposes them. Do not treat this short run as acceptance or loosen fidelity limits.
