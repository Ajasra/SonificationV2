# Acceleration proposal test progress

This ledger records executed proposal tests and conservative decisions. Raw reports and per-proposal decisions live under `docs/performance-results/next-acceleration/`. Numeric app gates in the queue target a verified 30 fps input. Current long app benchmarks use a verified 60 fps stress clip and cannot close that gate.

| Proposal | Test so far | Verdict / next work |
|---|---|---|
| P00 Baselines | Harness controls, report fields, clean revision validation, and split browser suite. Headless 60 fps profile-off app run reached 37.5 fps and 24.6 ms p95; GPU test suite 8/8. | In progress. Source/build dirty bit unresolved; real 30 fps visible test and equal app-level JS/WASM controls remain. |
| P01 Capture | One matched 60 s AMD headless A/B: texture 38.71 fps / 25.4 ms p95; reference bytes 24.45 fps / 51.1 ms p95; both passed fidelity. Forced fallback mode added and integration-tested. | Conditional keep texture after fidelity gate; reference bytes fallback only. P01 remains open for other capture surfaces, ImageBitmap/VideoFrame/camera and replication. |
| P02 Fused dispatch / validation | Six counterbalanced fused on/off runs; six validation on/off positions plus one retry after a timed-out run. | Fused result inconclusive (throughput favors off but p95 is noisy); keep validation on because disabling shows no stable gain. Headless 60 fps only. |
| P03 Monitoring/HUD | Six HUD on/off runs with audio active, GPU packet unchanged. Off averaged 55.4 vs 52.2 fps, but median p95 was 20.3 ms off vs 16.3 on. | Keep HUD/packet policy; no cadence change. Demand-driven packet and consumer-index tests remain open. |
| P04 Ordered readback ring | No ring prototype. Current serialized app route remains the control. | Not tested; blocked on P02/P03 attribution and sequence-safe ownership. |
| P05 WASM arena/copy reduction | Added optional pipeline arena, bit/state test passes; three synthetic 720p reports show mixed full-path p95 results by filter. | Conditional prototype only; no app route until browser-path win. Logical copies removed, physical bus traffic not measured. |
| P06 Pointwise kernels | CPU baseline: stream conversion 1.2/1.8 ms; Wavefolder 13.0 ms at 640x480. Amplify/Shiftr/SIMD/GPU chain not tested. | Prioritize only after resident segment and filter-specific conformance prototype. |
| P07 Spatial video kernels | CPU 640x480 baseline: four-filter Procamp/Colorizer/CVI/CRT rack 23.6 ms; CRT Bloom 8.4 ms, Procamp 5.9 ms. | Best GPU prototype candidate; no port or matched GPU app result yet. |
| P08 Temporal video kernels | CPU 640x480 baseline: Vidicon 4.25 ms, FrameDelay 2.74 ms; no GPU/history comparison. | Defer until spatial residency prototype; test storage/state before porting. |
| P09 Recurrent CPU filters | Synthetic 720p WASM comparison plus CPU 640x480 benchmark: Moog 37.7 ms, TapeWow 12.7 ms; WASM Moog/TapeWow loses on 720p. | Keep JS; Moog is high-value arena candidate, no more ports before P05. |
| P10 GPU TapeWow | No GPU port. | Not tested. |
| P11 Segment planner | No planner implementation; current eligibility is a static single-filter TapeSat gate. | Not tested. |
| P12 Worker scheduler | No worker prototype. | Not tested. |
| P13 Export/device rollout | No physical phone or export comparison in this pass. | Not tested. |

## P09 exploratory WASM numbers

Raw synthetic report: [0c809fda-e719-4d79-80f8-8e60462864c0](../../wasm-prototype/synthetic-0c809fda-e719-4d79-80f8-8e60462864c0.json). It used 20 measured frames after 5 warmup frames on a synthetic 720p canvas; browser decode, application monitoring, HUD and display were excluded. Representative DSP p95 (JS / scalar WASM / SIMD WASM): TapeWow 25.5 / 33.8 / 39.1 ms; Moog 103.0 / 104.2 / 106.9 ms; TapeSat→TapeWow 54.7 / 49.1 / 52.3 ms. Complete CPU path p95: 32.2 / 44.7 / 50.7, 112.9 / 116.1 / 118.1, and 66.8 / 60.2 / 64.0 ms respectively. Each number is one short run; report is exploratory, not a sustained comparison. The small tape-pair scalar gain does not establish an application-level winner.
