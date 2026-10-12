# User MP4: byte fallback fidelity and 60-second performance

Original report: benchmark-95bb5341-6e62-4835-97ce-096140508b85.json, copied unchanged from Downloads. Revision 5a8ca1a811d00cdce1f0aefe76b7dcab1154d845, recorded dirty true. Same 1280x720 MP4 SHA256 17ccc6c177541e8d16fe971349c788da9d3dc2b940add5ec199d4deee24d1465; default TapeSat-only preset; profiling enabled. Windows Chrome 155 user-agent, adapter information unavailable, hardwareConcurrency 11. Source cadence is 30 fps according to the user.

## Fidelity

The texture probe reproduced the sparse one-byte capture mismatch and failed. Automatic capture selection chose reference-bytes. The final resident fixture passed without changing limits:

| Case | Raw capture differences | Maximum filtered error | RMS error | Maximum pixel error | Compact error |
| --- | ---: | ---: | ---: | ---: | ---: |
| Synthetic RGB | 0 | 3.576e-7 | 1.088e-7 | 1 byte, 1 differing byte | 2.384e-7 |
| Provided source frame | 0 | 1.192e-6 | 3.940e-7 | 1 byte, 49 differing bytes | 1.192e-6 |

Sample-only fixtures at all three rates also passed. This validates the implemented input/sample/render/gather fixtures in the user's browser. It does not certify all parameter combinations, all frames of the video, other filters or other devices. The supplied source frame begins with black pixels but contains other values; the full synthetic pattern comparison remains part of the gate.

## Performance and gates

After 10-second warmup, measured 60.0311 seconds: 1,752 processed frames, 29.1849 fps, 34 skipped presented callbacks, zero observed long tasks.

| Gate or observation | Measured | Assessment |
| --- | ---: | --- |
| Complete elapsed path p95 <=25 ms | 20.4 ms | Pass in benchmark scope |
| Throughput >=29.4 fps | 29.1849 fps | Fail, short by 0.2151 fps (0.73%) |
| Callback gap fraction | 34/(1752+34) = 1.904% | Below 2% proxy; full application drop gate unverified |
| Measurement duration >=60 seconds | 60.0311 seconds | Pass |
| Five-minute sustained/full application/phones | Not measured | Open |

Complete-path p50/p95/p99: 11.9/20.4/23.5 ms. The zero captureMs/outputSubmitMs fields reflect operations included elsewhere; capture and rendering were not free. All snapshot, raster/readback, RGBA upload, GPU filtering/rendering and compact mapping remain included in complete elapsed time. Audio/HUD/recording and physical display completion are excluded.

| Timed segment | p50 ms | p95 ms |
| --- | ---: | ---: |
| Snapshot | 0.2 | 0.3 |
| Raster and reference readback | 5.0 | 7.1 |
| GPU prepare/upload/submit | 1.4 | 2.4 |
| Validation/completion/map wait | 5.0 | 12.4 |
| Mapped copy | 0.0 | 0.1 |

Percentiles cannot be added. Completion/map combines GPU execution, transfers and scheduling; no GPU timestamp attribution exists yet. Callback gaps do not identify decoder drops. The approximately 49-frame deficit relative to nominal 30 fps cannot be fully attributed by the 34 callback gaps; source cadence, loop transitions and callback scheduling require further telemetry.

The earlier 60-second GPU report recorded 16.80 fps and 51.9 ms p95. This report records 29.18 fps and 20.4 ms p95. These are observed improvements across the collected runs, not a controlled hardware speedup: adapter strings are unavailable here and hardwareConcurrency differs (16 earlier, 11 now).

## Next gates

1. Keep the candidate experimental: strict throughput is still below the declared minimum.
2. Repeat at 300 seconds on the same source/device and record hardware/power conditions. Inspect callback gaps, video loop boundaries and browser decoder counters before attributing the remaining FPS shortfall to the filter.
3. Obtain a matching TapeSat-only JS baseline and an unprofiled candidate run, retaining profiling-overhead differences explicitly.
4. Integrate compact samples into live audio/HUD, preserve presentation and cancellation behavior, then measure complete application cost.
5. Validate named desktop/phone devices and supported presets before backend promotion. TapeWow and Moog remain separate unsupported GPU work.
