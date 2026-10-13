# P02 — Fused dispatch and validation decision

Status: **inconclusive for fused dispatch; keep WebGPU validation on.** This is one six-run, counterbalanced headless cohort per variable on a 60 fps stress clip, not the visible 30 fps cohort. All completed runs passed the sample and resident fidelity gates.

## Fused dispatch

All six reports are adjacent. Same source hash, revision `970f8350646832e6f0c19b6d022b8543ed3b8fca`, AMD GCN-5/headless Chrome, 60 seconds, active audio at 0.25, HUD on, validation on, profiling off. Order was on/off, off/on, on/off.

| Pair | Fused fps / frame p95 | Unfused fps / frame p95 | Observation |
|---|---:|---:|---|
| 1 | 28.24 / 29.8 ms | 29.29 / 23.0 ms | Unfused faster and lower p95 |
| 2 | 26.23 / 83.5 ms | 34.00 / 30.6 ms | Unfused faster; fused run had a long tail |
| 3 | 29.80 / 17.3 ms | 35.46 / 26.5 ms | Unfused faster, fused p95 lower |

The six runs average 28.1 fps fused and 32.9 fps unfused; median frame p95 is 29.8 ms vs 26.5 ms. Throughput favors unfused in all three pairs, while p95 differs in direction across pairs and run-to-run variance is large (p99 50–143 ms). These data do not confirm the earlier small fused benefit. Keep the override and current default for now; repeat on a visible, verified 30 fps source before changing production dispatch.

## Validation scopes

The same six-position AB/BA order tested validation on/off with fused dispatch fixed off. One planned validation-on run stalled at 3 fps and failed the 210-second harness timeout after only 19 seconds measured (39-second app session); it produced no JSON report. I retried that validation-on run successfully. The completed pairs are therefore: on/off (28.52/29.29 fps), off/on (34.00/37.21 fps), on/off (51.72/51.79 fps). A validation-on retry completed the planned third pair against the following validation-off run; the timeout itself remains in the record. Frame p95 for successful validation on/off runs ranged 21.3–30.6 / 16.7–30.6 ms. The one timeout is recorded as a harness/runtime failure, not silently discarded.

The successful pairs show no repeatable validation-off gain; the cleanest final pair is effectively identical. Preserve validation on. The large change in performance between early and late runs and the isolated stall indicate this headless machine/session is not stationary enough for small timing claims.

## Scope and verification

Raw JSON reports are included beside this decision. The benchmark reports `dirty=true`, although `git status --porcelain` was empty before launch and the revision is explicit; this report-field issue remains unexplained. The 60 fps headless measurements do not close the app's 30 fps gate or physical-display acceptance. The split GPU browser suite previously passed all eight tests, including sample/state/pixel fidelity and final handoff.

