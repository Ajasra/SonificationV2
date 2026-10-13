# User application run, 2026-10-13

Original: [app-benchmark-08f69665-ac22-42d5-85c2-046aba64bac6.json](app-benchmark-08f69665-ac22-42d5-85c2-046aba64bac6.json).

SHA-256: `4DCCA71A2C7FD8044E13C622CD92ACC7DA1B7DFF031792934FA9C141064A2E36`. The preserved copy matches the Downloads original.

## Results

| Measurement | Result | Target / interpretation |
|---|---:|---|
| Source / resolution | Same MP4, 1280 × 720 | Matches prior run |
| Session / measured time | 89.77 / 71.26 seconds | More than 60 seconds collected |
| Backend / frames | 1972 GPU, 0 JS | GPU remained active throughout measured samples |
| Throughput | 27.67 fps | Improved from 24.86 fps, still below 29.4 fps |
| Frame path p50 / p95 / p99 | 23.2 / 32.7 / 37.4 ms | p95 above 25 ms; p99 improved from 86.8 ms |
| Presented callback gaps | 165 | About 7.7% of measured callbacks plus gaps; above 2% proxy |
| Capture p50 / p95 / p99 | 8.1 / 10 / 11.5 ms | Dominant steady CPU stage |
| GPU completion/readback p50 / p95 / p99 | 15 / 22.8 / 26.6 ms | Dominant async stage |
| Audio submission p95 | 0.2 ms | Audio unmuted, volume 0.32, context running |
| HUD render p50 / p95 / p99 | 2.4 / 3.5 / 4.2 ms | Separate RAF timing; competes for device time |
| Fidelity | Sample and resident passed | Declared limits unchanged |
| Adapter identity | Blank | Physical device remains unnamed |

The source SHA-256 is `17ccc6c177541e8d16fe971349c788da9d3dc2b940add5ec199d4deee24d1465`. The preset is the eligible single TapeSat at 44.1 kHz and uses reference-byte capture.

## Reset interpretation

The report contains only `initial-settings` at 0 seconds and one `settings-changed` reset at 8.51 seconds. There are no `frame-loop-stopped` entries, unlike the previous report. The idempotent stop change is consistent with this improvement, though this run cannot isolate causality. The settings change happened before the initial 10-second warmup elapsed, so the effective warmup ran again and explains why 89.77 seconds of session time yielded 71.26 measured seconds.

The report identifies revision `f103cbf8db997f2e3648a12edf2c8070cc4cf440` with `dirty: true`. It was produced from the working tree before the frame-loop fix was committed. Adapter information is blank; user-agent and hardwareConcurrency do not identify a device.

## Interpretation and next work

This is the best representative full application run so far: audio is active, the HUD is enabled, the source is playing, fidelity passed, and measurement lasted more than one minute. It still falls short of the 30 fps application goal. The browser's short-interval badge may round to 30 at times; the report's 71-second average is 27.67 fps.

Capture and GPU completion/readback dominate. Their p50s are 8.1 and 15 ms; their p95s are 10 and 22.8 ms. Audio submission is negligible on this run. HUD rendering is separate and may compete for time. Percentiles from separate stages are not additive.

Next prototype a lower-cost capture/upload path guarded by the existing byte and pixel fidelity preflight. Keep exact reference-byte fallback whenever it fails. In parallel, profile the GPU submit-to-map interval on a named adapter and investigate asynchronous readback pipelining, preserving ordered audio frames and TapeSat state. Do not relax fidelity thresholds. Repeat 60-second and five-minute runs after the optimization; test phones separately.
