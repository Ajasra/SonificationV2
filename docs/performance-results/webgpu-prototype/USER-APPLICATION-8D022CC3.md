# User application run, 2026-10-13

Original: [app-benchmark-8d022cc3-f8f4-4ea6-9b9e-6536bad94139.json](app-benchmark-8d022cc3-f8f4-4ea6-9b9e-6536bad94139.json).

SHA-256: `BF62A5EE4A0659B9FC5AD2875BCC37EE1AD1BF440419B1D453A6034F44F9B18C`. The preserved copy matches the Downloads file.

## Results

| Measurement | Result | Target / interpretation |
|---|---:|---|
| Source / resolution | Previously used MP4, 1280 × 720 | Matches test source and resolution |
| Session / collected measurement | 90.97 / 61.55 seconds | Adequate for a 60-second run; loop restarts caused new warmups |
| Processed frames / backend | 1530 GPU, 0 JS | GPU path remained active during measured frames |
| Throughput | 24.86 fps | Below 29.4 fps target |
| Complete frame path p50 / p95 / p99 | 23.3 / 31.8 / 86.8 ms | p95 exceeds 25 ms; large tail spikes |
| Presented callback gaps | 124 | About 7.5% of measured callbacks plus gaps; above 2% proxy target |
| Capture p50 / p95 / p99 | 8.2 / 11.3 / 23.7 ms | Significant CPU capture cost |
| GPU completion/readback p50 / p95 / p99 | 14.8 / 22.4 / 63.1 ms | Significant cost and large tail spikes |
| HUD render p50 / p95 / p99 | 2.2 / 3.0 / 3.5 ms | Separate RAF measurement; competes for time, not added to frame-path latency |
| Audio state | Muted; audio context null | This run does not validate active audio output |
| GPU fidelity | Sample and resident passed | Declared sample, capture, render and compact-output limits pass |
| Device identity | Adapter information blank | Hardware model and phone acceptance remain unknown |

The source SHA-256 is `17ccc6c177541e8d16fe971349c788da9d3dc2b940add5ec199d4deee24d1465`. The preset is the eligible single 44.1 kHz TapeSat path with reference-byte capture.

The measurement reset history records frame-loop stops at 5.83, 5.97, 25.51 and 25.67 seconds, with restarts at 7.48 and 27.45 seconds. Since each restart starts a fresh 10-second warmup, the report retained two measurement windows totaling 61.55 seconds. The report preserves those earlier samples correctly. The reset list does not identify which UI or media event stopped each loop.

The build reports revision `f103cbf8db997f2e3648a12edf2c8070cc4cf440` and `dirty: true`. The automatic compatible-preset change was present in the dirty working tree but had not yet been committed when this run was recorded. Adapter identification is blank, so this report cannot establish a named-device baseline.

## Interpretation and next work

This is the first sufficiently long application GPU measurement for the MP4, but it misses the 30 fps gate. The workload also had audio muted, so repeat with audio unmuted and a running audio context before treating it as full application acceptance.

The largest measured costs are CPU reference capture (`drawImage` plus `getImageData`) and GPU processing through completion/readback. Their separate percentiles are not additive, but their p50 values together account for most of the 23.3 ms complete-frame p50. The HUD render p95 is 3 ms in its independent RAF. The 86.8 ms frame-path p99 and 63.1 ms GPU p99 indicate occasional stalls deserve attention alongside median throughput.

Next, reduce capture/readback work while preserving exact reference bytes and audio sample order. First measure a matched unmuted run on a named desktop and trace the two pairs of frame-loop stops. Then prototype pipelined GPU completion/readback with bounded in-order audio delivery, since the current frame loop awaits every GPU result. Re-run all existing fidelity gates unchanged before performance measurements. Phone acceptance remains separate.
