# User application run, 2026-10-13

Original: [app-benchmark-c0d7622a-b3b6-4b8d-aa78-bc2cfba3525d.json](app-benchmark-c0d7622a-b3b6-4b8d-aa78-bc2cfba3525d.json).

SHA-256: `96FF4E86AABFB8CC7BEA18A3245637C4C215D9276AC39C2641301309B36BE8B5`. The preserved copy matches the Downloads original.

## Results

| Measurement | Result | Comparison with `5b0bba0b` |
|---|---:|---:|
| Source / resolution | Same MP4, 1280 × 720 | Same source hash |
| Session / measured time | 112.22 / 97.16 seconds | Similar sustained duration |
| GPU / JS frames | 2083 / 0 | GPU remained active |
| Throughput | 21.44 fps | Up from 9.39 fps |
| Frame path p50 / p95 / p99 | 23.7 / 82.5 / 88.2 ms | p50 down from 83.5 ms; tail remains high |
| Presented callback gaps | 547 | Improved from 2055, still frequent |
| Capture p50 / p95 / p99 | 8.3 / 22.1 / 24.1 ms | p50 down from 24.2 ms |
| GPU completion/readback p50 / p95 / p99 | 15.3 / 59.7 / 66.3 ms | p50 down from 59.3 ms; tail remains high |
| Audio / HUD | Unmuted, context running, HUD enabled | Same operating mode |
| Fidelity | Sample/resident passed; texture probe failed | Reference-byte mode required |
| Adapter identity | Blank | Hardware remains unnamed |

The report revision `9afdb6c636e3c278b404762f15b09f0a41837533` matches the hierarchical scan commit. `dirty` is true, so the exact source tree state is not certified by the report metadata.

## Interpretation

The new hierarchical scan corresponds with a large improvement in the measured run: throughput increased by about 128%, while median frame path fell from 83.5 to 23.7 ms and median GPU completion/readback from 59.3 to 15.3 ms. The same video, dimensions, active audio/HUD state, and 44.1 kHz TapeSat preset were used. This is strong evidence that the scan change helped on this run, but the adapter identity is blank and the measurement is not named-device acceptance.

Average throughput remains below the 29.4 fps acceptance threshold. Median frame time alone hides a long tail: frame path p95 is 82.5 ms, GPU completion/readback p95 is 59.7 ms, and there are 547 missed presented callbacks. Capture p50 improved to 8.3 ms but its p95 is 22.1 ms. Audio submission, telemetry and other frame work remain negligible by their reported percentiles; HUD p95 is 3.4 ms.

## Next work

Keep the hierarchical scan. Investigate long frame tails next, focusing on the GPU completion/readback interval and capture p95 rather than further reducing median scan work. A profile-only run can split GPU command preparation from submit-to-map completion, but those internal timings are diagnostic and must not replace complete frame path, processed FPS or callback gaps for acceptance. Preserve the exact texture fallback and fidelity limits.
