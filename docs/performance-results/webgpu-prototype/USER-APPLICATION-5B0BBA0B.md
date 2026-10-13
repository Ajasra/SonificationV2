# User application run, 2026-10-13

Original: [app-benchmark-5b0bba0b-f781-4dee-91a9-e0ee603a8ec7.json](app-benchmark-5b0bba0b-f781-4dee-91a9-e0ee603a8ec7.json).

SHA-256: `62BBA6D697F72D50795DC4417BC7CC1366F416ECD0E90C23F97C6F5019CFB5BC`. The preserved copy matches the Downloads original.

## Results

| Measurement | Result | Interpretation |
|---|---:|---|
| Source / resolution | Same MP4, 1280 × 720 | Source hash matches the earlier user runs |
| Session / measured time | 121.86 / 101.86 seconds | Sustained sample after the settings reset and warmup |
| GPU / JS frames | 956 / 0 | GPU backend remained selected |
| Throughput | 9.39 fps | Similar to the 9.83 fps short run, far below 30 fps |
| Frame path p50 / p95 / p99 | 83.5 / 99.5 / 153.3 ms | Severe latency and long-tail stalls |
| Presented callback gaps | 2055 | Playback cadence is far below source 30 fps |
| Capture p50 / p95 / p99 | 24.2 / 27.2 / 29.3 ms | Remains high after moving fidelity probes off the live canvas |
| GPU completion/readback p50 / p95 / p99 | 59.3 / 73.8 / 127.1 ms | Main measured stage after capture is accounted separately |
| Audio / HUD | Unmuted, context running, HUD enabled | Comparable to the prior application runs |
| Fidelity | Sample and resident passed; texture probe failed | Exact reference-byte mode remains required |
| Adapter identity | Blank | GPU model and driver remain unknown |

The report revision is `757111922e0f385f650e5b4c278b01f21b58c8e8`, matching the live-readback isolation commit; `dirty` is still true. The failed texture probe reported up to two byte levels of pixel error, so the strict exact-capture gate continues to choose reference bytes.

## Interpretation

This longer run confirms that the low throughput persists; it is not just a short-run fluctuation. The detached fidelity probe did not recover CPU capture time: capture p50 remains 24.2 ms. The corrected stage attribution reports 59.3 ms p50 in the GPU completion/readback path, excluding the lazy CPU capture. These timings identify two separate costs but do not divide the GPU interval into command encoding, transfer, shader execution, and map wait.

The previous run's hypothesis that importing the live readback canvas caused the capture increase is not supported by this result. The adapter remains unidentified, so the exact hardware cause is still unknown. Do not loosen the byte/pixel fidelity gates or treat GPU selection as performance acceptance.

## Next optimization target

Investigate the 24 ms CPU pixel read and the 59 ms GPU completion/readback path independently. The highest-value GPU design experiment is to reduce per-frame synchronization: evaluate a bounded readback ring that submits ordered GPU frames while earlier compact audio results map, preserving TapeSat state and output ordering. In parallel, measure whether the affine scan's many dependent compute passes can be reduced. Any change must retain sample, rendered-pixel, compact-gather, state-continuity and audio-order fidelity before another timed run.
