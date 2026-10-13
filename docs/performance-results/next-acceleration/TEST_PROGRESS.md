# Acceleration proposal test progress

This ledger records executed proposal tests and conservative decisions. Raw reports and per-proposal decisions live under `docs/performance-results/next-acceleration/`. Numeric app gates in the queue target a verified 30 fps input. Current long app benchmarks use a verified 60 fps stress clip and cannot close that gate.

| Proposal | Test so far | Verdict / next work |
|---|---|---|
| P00 Baselines | Harness controls, report fields, clean revision validation, and split browser suite. Headless 60 fps profile-off app run reached 37.5 fps and 24.6 ms p95; GPU test suite 8/8. | In progress. Source/build dirty bit unresolved; real 30 fps visible test and equal app-level JS/WASM controls remain. |
| P01 Capture | One matched 60 s AMD headless A/B: texture 38.71 fps / 25.4 ms p95; reference bytes 24.45 fps / 51.1 ms p95; both passed fidelity. Forced fallback mode added and integration-tested. | Conditional keep texture after fidelity gate; reference bytes fallback only. P01 remains open for other capture surfaces, ImageBitmap/VideoFrame/camera and replication. |
| P02 Fused dispatch / validation | Earlier two-pair fused experiment preserved in the plan; suite now stable when split into serial browser processes. | Re-run dispatch on current runner; test validation separately. |
| P03 Monitoring/HUD | Compact GPU packet and HUD timings are present in reports; no demand-driven packet or cadence A/B yet. | Not tested. |
| P04 Ordered readback ring | No ring prototype. Current serialized app route remains the control. | Not tested; blocked on P02/P03 attribution and sequence-safe ownership. |
| P05 WASM arena/copy reduction | Existing synthetic benchmark still copies a full Float32 segment into/out of WASM. No arena prototype or transfer-count comparison yet. | Not tested. |
| P06 Pointwise kernels | Existing scalar/SIMD benchmark does not cover Amplify/Shiftr/Wavefolder. | Not tested. |
| P07 Spatial video kernels | No candidate port or matched app path. | Not tested. |
| P08 Temporal video kernels | No candidate port or long-history GPU prototype. | Not tested. |
| P09 Recurrent CPU filters | Synthetic 20-frame 720p benchmark rerun; JS is faster for TapeWow and Moog; tape pair favors WASM scalar modestly. | Reject general scalar/SIMD recurrent replacement on these measurements; tape pair is conditional and requires longer P05 arena run. |
| P10 GPU TapeWow | No GPU port. | Not tested. |
| P11 Segment planner | No planner implementation; current eligibility is a static single-filter TapeSat gate. | Not tested. |
| P12 Worker scheduler | No worker prototype. | Not tested. |
| P13 Export/device rollout | No physical phone or export comparison in this pass. | Not tested. |

## P09 exploratory WASM numbers

Raw synthetic report: [0c809fda-e719-4d79-80f8-8e60462864c0](../../wasm-prototype/synthetic-0c809fda-e719-4d79-80f8-8e60462864c0.json). It used 20 measured frames after 5 warmup frames on a synthetic 720p canvas; browser decode, application monitoring, HUD and display were excluded. Representative DSP p95 (JS / scalar WASM / SIMD WASM): TapeWow 25.5 / 33.8 / 39.1 ms; Moog 103.0 / 104.2 / 106.9 ms; TapeSat→TapeWow 54.7 / 49.1 / 52.3 ms. Complete CPU path p95: 32.2 / 44.7 / 50.7, 112.9 / 116.1 / 118.1, and 66.8 / 60.2 / 64.0 ms respectively. Each number is one short run; report is exploratory, not a sustained comparison. The small tape-pair scalar gain does not establish an application-level winner.
