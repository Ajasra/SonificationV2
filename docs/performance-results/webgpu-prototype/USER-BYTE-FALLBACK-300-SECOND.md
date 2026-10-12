# User MP4: five-minute TapeSat benchmark pass

Original report: benchmark-cfa78a3a-e36e-4a13-b4b4-f55bde8b7bf8.json, copied unchanged from Downloads with matching SHA256. Revision 5a8ca1a811d00cdce1f0aefe76b7dcab1154d845, recorded dirty true. Same known 30 fps MP4, 1280x720, default TapeSat-only preset, profiling enabled, reference-bytes capture. Windows Chrome 155 user-agent, hardwareConcurrency 11; adapter strings and exact CPU/GPU models unavailable.

## Scoped gate result

After 10-second warmup: 300.0272 seconds measured, 9,001 processed frames.

| Benchmark gate | Result | Assessment |
| --- | ---: | --- |
| Throughput >=29.4 fps | 30.0006 fps | Pass |
| Complete elapsed path p95 <=25 ms | 20.7 ms | Pass |
| Missed presented processing callbacks <=2% proxy | 0 | Pass |
| Five-minute duration | 300.0272 seconds | Pass |
| Implemented fidelity preflight | Passed | Pass on tested fixtures |

Complete-path p50/p95/p99: 11.2/20.7/23.5 ms. Zero observed long tasks. Aggregate results show five minutes of full source throughput with no observed processing callback gaps. There are no per-minute timing distributions, thermal/power measurements or decoder-drop counters, so those details are not inferred.

## Fidelity and capture

The original texture probe failed sparse RGB capture comparison, and the automatic reference-byte fallback passed. Raw input differences were zero for both final fixture cases. Synthetic max/RMS sample error: 3.576e-7/1.088e-7; source-frame max/RMS: 9.537e-7/2.986e-7. Pixel byte error was at most one, with 1 differing byte in the synthetic case and 95 in the source frame. Compact errors were 2.384e-7/8.941e-7. All sample-only rates also passed.

These are preflight fixture comparisons, not a sample-by-sample reference comparison of all 9,001 measured frames. Existing bounds remain unchanged. The fallback preserves the reference canvas reader's bytes.

## Measured path

| Segment | p50 ms | p95 ms |
| --- | ---: | ---: |
| Snapshot | 0.2 | 0.3 |
| Raster/reference readback | 4.5 | 6.5 |
| GPU prepare/upload/submit | 1.3 | 2.0 |
| Validation/completion/map wait | 4.8 | 13.0 |
| Mapped copying | 0.0 | 0.1 |

Full snapshot/raster/readback/RGBA upload, GPU serialization/filter/render and compact sample mapping remain inside the complete elapsed path. Capture/output-submit zero fields mean those operations are included elsewhere. Percentiles cannot be added. GPU wait combines execution, transfers and scheduling; it is not a shader timestamp.

The earlier 60-second run with the same code recorded 29.1849 fps and 20.4 ms p95, with 34 callback gaps. This later longer run closes the benchmark throughput/duration gates for the supported preset on the reporting browser. No intervening filter optimization is claimed; conditions explaining the earlier shortfall are unrecorded.

## Decision and remaining gates

Advance TapeSat-only GPU support to application integration. Preserve JS fallback for unsupported configurations, unavailable/lost devices, capture errors and failed fidelity. Connect compact playback/preview data to the real audio/HUD route and measure its cost before production promotion.

This report excludes live audio, HUD, recording, physical display completion, other presets and physical phones. It therefore does not close the original all-device/full-application goal. Named hardware and phone matrix, real application throughput/drops and broader parameter/state acceptance remain open. TapeWow and Moog are not supported by this GPU backend.
