# First physical desktop WebGPU TapeSat report

Received 2026-10-11 from Downloads. The original JSON is preserved unchanged as `benchmark-fa672f8b-2613-475f-a873-35432feca102.json`. Source/copy SHA256: `06295ab01f912124a3efcc251f7ee4428758c4a07b879b3850be8d984ebddc6b`.

## Observations

- Backend: experimental WebGPU TapeSat, default parameters, 1280x720, NVIDIA Ampere adapter, Windows Chrome 155, hardware concurrency 16. Exact GPU/CPU models are unavailable.
- Same video SHA256 as the earlier user reports: `17ccc6c177541e8d16fe971349c788da9d3dc2b940add5ec199d4deee24d1465`. Source cadence is 30 fps according to the user.
- Build revision `06a17949af2cef8f6314a617d132380ea89b5f43`, report records `dirty: true`. Preserve this flag; the report alone cannot identify which files were modified when the server captured metadata.
- Warmup 10 seconds; measurement 10.0322 seconds, 208 processed frames, 20.7332 fps, 93 skipped presented callbacks. Gap fraction `93 / (208 + 93)` is approximately 30.9%; it measures callback gaps, not decoder drops or the full application's drop rate.
- No observed main-thread long tasks. GPU waits can reduce throughput without appearing as main-thread long tasks.

| Measured stage | p50 ms | p95 ms |
| --- | ---: | ---: |
| CPU canvas capture | 5.5 | 6.9 |
| Pipeline including serialization, GPU work/upload/readback and decoding | 26.6 | 32.4 |
| Canvas submission | 0.3 | 0.4 |
| Complete measured path | 32.1 | 39.3 |

The historical `completeCpuPathMs` field includes elapsed asynchronous GPU waits for this backend; it is wall time, not CPU execution time. Stage percentiles cannot be added to reconstruct complete-path percentiles.

## Gate assessment

Shader compilation, pipeline creation and dispatch completed on this physical adapter. The report contains no comparison against reference samples or pixels, so numerical fidelity remains unverified.

The exploratory run misses the proposed 29.4 fps minimum and 25 ms p95 path budget. It needs at least 14.3 ms reduction in complete-path p95 (36.4%) to meet the time budget. Measurement duration is also shorter than the 60-second gate, and audio, HUD, recording and display completion are excluded. Phone and sustained acceptance remain open.

The earlier tape report used TapeSat plus TapeWow. This new report uses TapeSat alone; their FPS difference cannot establish a GPU speedup. No matching physical-device JS TapeSat-only report is available.

## Next implementation priorities

1. Expose a browser fidelity check that runs on the same physical adapter before a performance run, including frame/tile history and full-size samples. Keep the declared error bounds unchanged.
2. Separate serialization, upload/submission, GPU completion/readback and decoding timing. Use optional GPU timestamp queries when supported; keep their overhead explicit. Current timings do not identify which GPU-related stage dominates.
3. Reuse buffers, parameter buffers, pipelines and bind groups. Current per-frame allocation is visible in the implementation but its contribution is unmeasured.
4. Replace each thread's sequential 256-sample tile loop with an ordered workgroup scan and compare both fidelity and time.
5. Move capture/serialization/presentation onto GPU buffers/textures to remove full sample readback; preserve the compact audio/HUD gathers and artwork mapping.
6. Compare identical TapeSat-only JS/GPU cases on this device, then repeat at 60 seconds and sustained duration before adding TapeWow or promoting a backend.
