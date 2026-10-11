# Physical desktop GPU fidelity and 60-second run

Original report: `benchmark-d34b6c2a-796d-48c2-84e7-1760a848a844.json`, preserved unchanged from Downloads. Build `ff27181ec3a182208109fc08d264e713c2afc59a`, recorded dirty flag true. NVIDIA Ampere adapter, Windows Chrome 155, same video hash and default TapeSat-only preset as the first GPU report. Exact GPU model and power conditions remain unknown.

## Fidelity evidence

The declared sample gate passed on this physical GPU. Maximum absolute/RMS error:

| Sample rate | Samples compared | Maximum error | RMS error |
| --- | ---: | ---: | ---: |
| 8,000 | 73,987 | 9.537e-7 | 1.703e-7 |
| 44,100 | 5,604,099 | 1.073e-6 | 3.593e-7 |
| 96,000 | 73,987 | 7.272e-6 | 1.859e-6 |

Limits remain max error 1e-4 and RMS 1e-5. This closes the implemented fixture's sample gate on this adapter, including parameter changes and retained frame/tile history. It does not establish byte-identical decoded pixels, all parameter combinations, other adapters or phone behavior.

## Performance evidence

After 10-second warmup: 60.0086 seconds measured, 1,008 processed frames, 16.7976 fps, 792 skipped presented callbacks, zero observed long tasks. Callback gap fraction is 792/(1008+792)=44%; this is not a decoder drop measurement. Complete-path p50/p95 is 35.3/51.9 ms. The proposed 29.4 fps and 25 ms p95 gates fail.

| Timed segment | p50 ms | p95 ms |
| --- | ---: | ---: |
| Capture | 5.6 | 7.6 |
| Stream encode | 3.8 | 6.5 |
| GPU preparation/submission | 1.2 | 1.7 |
| Validation/completion/map wait | 17.8 | 33.0 |
| Mapped copy | 1.7 | 2.3 |
| Stream decode | 4.1 | 5.6 |
| Canvas submit | 0.3 | 0.4 |

The largest measured segment combines GPU execution, transfers, validation, scheduling and map latency. Its components cannot be separated from this report. Percentiles cannot be added. The historical completeCpuPathMs field is elapsed wall time including GPU waits. Audio/HUD/recording/display completion remain excluded.

The earlier 10-second run measured 20.73 fps and 39.3 ms p95. Different duration and added instrumentation prevent attribution of the worse result to a particular cause. There is still no matching physical-device JS TapeSat-only baseline.

## Implementation decision

Keep GPU experimental. The implemented sample fixture now permits optimization comparisons on this adapter. Prioritize removing the full-stream CPU/GPU round trip through GPU capture/serialization/presentation and compact audio/HUD gathers. GPU timestamp instrumentation can distinguish shader work from completion/map overhead. Replace sequential per-thread tile loops with parallel workgroup scans, and reuse resources; their individual gains must be measured. Do not infer that allocation is the dominant cost: preparation/submission p95 is only 1.7 ms, although allocation can affect later execution.

Repeat the identical fidelity fixture and 60-second report after each algorithm/path change. Full application, five-minute sustained, pixel and physical-phone gates remain open.
