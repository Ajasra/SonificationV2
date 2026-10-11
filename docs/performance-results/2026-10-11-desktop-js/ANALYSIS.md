# Desktop JavaScript reference results

User-generated reports received 2026-10-11. Original Downloads files were copied unchanged and verified by SHA-256. These are provisional reference measurements, not device acceptance.

## Conditions captured in the reports

- Windows, Chrome 155, 16 logical processors reported by the browser. CPU/GPU models and power conditions were not captured.
- Same 1280×720 decoded source and 1280×720 processing resolution; same source SHA-256 in all runs.
- 10-second warmup and approximately 10-second measurement per preset; profiling enabled.
- Reference video capture/readback → JavaScript processing → canvas submission. Live audio, application HUD, recording and physical presentation confirmation excluded.
- Selected target: 60 fps. Control callbacks are approximately 33.33 ms apart with no skipped presented callbacks, indicating roughly 30 fps source delivery during this test. The source file was not available at its reported name in Downloads, so encoded frame rate was not independently probed. Selecting 60 fps does not change input cadence.
- Build metadata: revision `18730183210393bf695b7f216a25b06780d4fec5`, dirty=true. Metadata was captured at benchmark-server startup; this records an uncommitted snapshot rather than proving pristine output from that revision. Restart the server after committing before collecting comparable clean-revision reports.

## Measured results

| Preset | Processed fps | Complete CPU path p50 / p95 | Pipeline p95 | DSP p50 / p95 | Capture p95 | Missed presented callbacks | Long tasks |
|---|---:|---:|---:|---:|---:|---:|---:|
| [Unfiltered](benchmark-0a7e8dd3-cb45-484b-a969-b569cff248bf.json) | 30.07 | 9.2 / 13.1 ms | 3.0 ms | 0 / 0 ms | 10.2 ms | 0 | 0 |
| [TapeSat + TapeWow](benchmark-ef45551d-a1f9-4e11-b33f-d0ec56ff5b40.json) | 15.03 | 48.9 / 51.7 ms | 42.7 ms | 34.9 / 36.4 ms | 10.0 ms | 150 | 60, totaling 3.074 s |
| [Moog Ladder](benchmark-259f6559-54d5-4931-9e5b-cced7c4398b8.json) | 7.51 | 115.3 / 117.5 ms | 107.0 ms | 100.3 / 101.9 ms | 11.0 ms | 225 | 75, totaling 8.675 s |

The tape run processed 151 frames while missing 150 presented callbacks. Moog processed 76 while missing 225. These correspond to about half and three quarters of the observed opportunities being missed. Callback gaps do not count every possible decode/source failure.

## Conclusions supported by these measurements

1. The two filtered racks cannot keep up with the approximately 30 fps input on this desktop in the current reference path. Their callback intervals cluster near 66.7 ms and 133.3 ms, respectively, consistent with processing every second and fourth opportunity.
2. DSP is the largest measured cost in both filtered runs. Median DSP time is approximately 35 ms for the tape pair and 100 ms for Moog. These measurements support the chosen WASM comparison cases, but cannot establish the speedup a compiler will deliver.
3. Capture/readback remains significant even without filters: 6.5 ms median and 10.2 ms p95. The unfiltered complete path has 13.1 ms p95, already above the proposed desktop 12 ms processing budget before adding application monitoring/HUD. Desktop 60 fps work therefore needs capture-path investigation as well as faster filters.
4. Setup/parameter synchronization measured at or below 0.1 ms p95 in these runs. It is not the dominant optimization opportunity for these presets.
5. Output submission is below 0.5 ms p95, but this is CPU API submission time, not proof that compositing/display completes within that interval.

Indicative whole-path improvements needed to reach the proposed budgets: tape 51.7/25 ≈ 2.1× and Moog 117.5/25 = 4.7× for a 25 ms budget; tape 51.7/12 ≈ 4.3× and Moog 117.5/12 ≈ 9.8× for 12 ms. These ratios are arithmetic planning indicators for the current desktop path, not phone predictions, achievable speedups or additive percentile budgets. Individual p95 stage values must not be summed as though they came from one frame.

## Implementation priorities

1. Complete deterministic TapeWow fixtures and state tests, then measure TapeSat and TapeWow individually as well as together. The combined report cannot identify which one dominates.
2. Compile the full-resolution tape segment and scalar Moog to WASM with the current numerical model, measuring complete browser paths against this reference. Treat SIMD as a separately measured candidate; nonlinear Moog recurrence limits sample-wise parallelism.
3. Separate drawImage and getImageData timings. Compare capture paths before selecting worker/OffscreenCanvas/GPU integration; a worker can improve responsiveness while leaving throughput unchanged.
4. Prototype GPU-resident capture, compatible DSP and output with bounded monitor readback. Include every CPU/GPU crossing; faster shader time alone does not satisfy the target.
5. Collect 60-second unprofiled and profiled runs, followed by five-minute runs, using an independently verified 60 fps source for desktop acceptance and named physical phones for phone acceptance. Include live monitoring/HUD in application acceptance.

No desktop 60 fps or physical-phone acceptance is established by these three short reference runs.
