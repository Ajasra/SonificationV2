# User application run, 2026-10-12

Original: [app-benchmark-ca63ac3b-2532-44a6-8c23-6e1acdd0ce86.json](app-benchmark-ca63ac3b-2532-44a6-8c23-6e1acdd0ce86.json).

SHA-256: `1EAE24FD49A2A6CA11EB9F931EA7775872A099D18867DED7D8D7E68140877DA1`. The preserved copy matches the Downloads original byte for byte.

## Results

| Measurement | Result | Gate |
|---|---:|---|
| Resolution | 1280 × 720 | Correct |
| Measurement after 10-second warmup | 7.4493 seconds | Too short for 60-second acceptance |
| Completed frames | 208 GPU, 0 JS | GPU path used throughout measurement |
| Throughput | 27.9221 fps | Below 29.4 fps |
| Frame path p50 / p95 / p99 | 22.8 / 31.3 / 34.0 ms | p95 above 25 ms |
| Missed presented callbacks | 15 | 15 / (208 + 15) = 6.73% gap proxy; above 2% |
| Audio | Unmuted, volume 0.8, context running | Submission enabled; physical output unverified |
| HUD | Enabled | Included in application workload |
| Source at download | Playing | Report does not establish absence of earlier pauses |
| Sample and resident fidelity | Passed | Declared limits unchanged |

The source hash matches the previous MP4. The preset is the supported single TapeSat at 44100 Hz, unsigned 8-bit interleaved RGB, with reference-byte capture. Both fidelity gates pass, including exact capture bytes and rendered pixel error at most one byte value.

The report identifies revision `7d5c0589c064746d4186e8734b80f327c2e002ad` with `dirty: true`. Preserve that provenance: the report does not identify the dirty changes. Adapter identity is blank; Windows Chrome user-agent and hardwareConcurrency 9 do not identify physical hardware.

## Interpretation and next implementation

This confirms functional application GPU processing with audio and HUD active. It does not close the performance gate. The previous standalone five-minute report achieved 30.0006 fps and 20.7 ms p95; this application report achieved 27.9221 fps and 31.3 ms p95. These are different workloads and measurement lengths, with unspecified physical hardware/power conditions. Their difference cannot be assigned to audio or HUD from the available aggregate timings.

The next implementation should add stage timings for capture, GPU submission/completion/readback, audio submission and telemetry updates, plus separate HUD RAF duration/cadence. Keep aggregate frame latency and callback throughput. The HUD draws in a separate RAF: it competes for throughput but its drawing time is not explicitly included in the current frame-path sample.

Then compare matched runs with audio/HUD enabled and disabled to identify the added cost. Optimize the measured dominant stage; consider reducing redundant HUD redraws to new data/display changes if HUD cost is material. Keep capture fidelity, playback sample mapping and filter state semantics unchanged. Repeat at least 60 seconds after warmup, then five minutes, on named desktop and phone hardware. Presented callback gaps remain an observation proxy, not attributed decoder or physical display drops.

No source changes or new tests were made for this report analysis. Production remains on JS; the supported GPU application remains opt-in.
