# User application run, 2026-10-13

Original: [app-benchmark-154b0141-c93d-455a-b63c-c4a01a116147.json](app-benchmark-154b0141-c93d-455a-b63c-c4a01a116147.json).

SHA-256: `27470FA4180CE0957A209FC791CE006DB1D541BF1B685330DA08BEB744A17C9F`. The preserved report matches the Downloads file.

## Results

| Measurement | Result | Previous run `c0d7622a` |
|---|---:|---:|
| Source / resolution | Same MP4, 1280 × 720 | Same source hash |
| Session / measured time | 95.36 / 76.63 seconds | 112.22 / 97.16 seconds |
| GPU / JS frames | 797 / 0 | 2083 / 0 |
| Throughput | 10.40 fps | 21.44 fps |
| Frame path p50 / p95 / p99 | 76.5 / 117.3 / 154.7 ms | 23.7 / 82.5 / 88.2 ms |
| Presented callback gaps | 1492 | 547 |
| Capture p50 / p95 / p99 | 23.8 / 37.2 / 40.4 ms | 8.3 / 22.1 / 24.1 ms |
| GPU completion/readback p50 / p95 / p99 | 57.0 / 92.5 / 129.2 ms | 15.3 / 59.7 / 66.3 ms |
| GPU preparation/submission p50 / p95 / p99 | 1.4 / 2.3 / 2.7 ms | Not collected |
| GPU completion/map p50 / p95 / p99 | 44.0 / 90.4 / 125.8 ms | Not collected |
| Mapped copy p50 / p95 / p99 | 0 / 0.1 / 0.2 ms | Not collected |
| Fidelity / capture path | Sample and resident pass; texture probe fails; reference bytes selected | Reference bytes selected |
| Audio / HUD | Unmuted, context running, HUD enabled | Same operating mode |
| Adapter identity | Blank | Blank |

The `gpuInternalTimings` arrays contain 921 samples, while the measured application interval contains 797 GPU frames. Internal timings include frames outside the measured window, including warmup; use them to locate bottlenecks, not as an acceptance denominator.

## Interpretation

Throughput regressed substantially relative to the preceding user run. This report does not establish why: the GPU adapter is unnamed, and the build metadata says revision `9afdb6c636e3c278b404762f15b09f0a41837533`, `dirty: true`. The report contains the new profile fields, so profiling code ran, but the revision marker was captured by the still-running Vite server before commit `113e000`. The run therefore cannot certify the exact source revision. Profiling overhead is also not isolated as a cause of the lower result.

Within this run, GPU preparation/submission is small (p95 2.3 ms) and mapped copying is negligible (p95 0.1 ms). The combined error-scope completion plus readback-map wait is large (p95 90.4 ms). Capture is also material (p95 37.2 ms); the texture probe failed, so the application selected the CPU reference-byte capture path. Current evidence points to completion/map wait and capture as the expensive intervals, but the combined timing cannot distinguish `popErrorScope()` from `mapAsync()`.

## Next diagnostic

The follow-up implementation now reports `gpuValidationErrorScopeMs` and `gpuReadbackMapMs` separately while retaining the combined interval. Restarted benchmark server URL: `http://127.0.0.1:5176/?gpu=tapesat&gpu-profile=1`. Its injected revision matches code commit `4d58568`; the checkout is clean, though this development server still injects `dirty: true`, so treat the revision as the identifier and the flag as unreliable. Repeat with the same video/settings. Keep the complete frame path, processed FPS, and callback gaps as acceptance metrics; retain internal spans only for diagnosis.
