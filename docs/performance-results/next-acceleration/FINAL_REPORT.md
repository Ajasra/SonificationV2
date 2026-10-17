# Acceleration test campaign: final verdict

Date: 2026-10-14. The detailed proposal ledger is in [`TEST_PROGRESS.md`](TEST_PROGRESS.md), the complete report is [`docs/NEXT_ACCELERATION_TEST_REPORT.md`](../../NEXT_ACCELERATION_TEST_REPORT.md), and the experiment design is [`docs/NEXT_ACCELERATION_TEST_PLAN.md`](../../NEXT_ACCELERATION_TEST_PLAN.md).

## Verdict

**Local 720p30 TapeSat desktop acceptance: GPU PASS. Full P00–P13 hardware/product acceptance: NOT COMPLETE.** The candidate GPU route is source-fidelity gated and should remain limited to its supported path. This evidence does not approve automatic routing or mobile rollout.

## New matched application evidence

The [three-round matrix](P00/app-backend-matrix-2026-10-14T023648-698Z-9c075513.json) contains three clean headed 60-second runs each for JS, scalar WASM arena and GPU TapeSat. All used the same ffprobe-verified 1280×720 30 fps source, clean revision `af54041d566575aa38b7a698dfc97e3529cd671e`, active browser audio context at volume 0.25, HUD on and profiling off.

| Route | Median throughput | Median frame-path p95 | Repetitions meeting ≥29.4 fps and ≤25 ms p95 |
|---|---:|---:|---:|
| JS reference | 29.999 fps | 28.6 ms | 3/3 fps; 1/3 p95 |
| WASM arena | 29.980 fps | 24.1 ms | 3/3 fps; 2/3 p95 |
| GPU TapeSat | 29.985 fps | 11.1 ms | 3/3 for both; fidelity 3/3 |

GPU's paired p95 advantage over JS was 13.4–21.0 ms and present in all three rounds. WASM's paired p95 changes were -8.0, +2.7 and -0.9 ms, so the apparent median gain is not consistent. The GPU's five-minute headed follow-up also passed: 29.982 fps, 10.7 ms p95, 12.7 ms p99, fidelity passed, one callback-gap proxy event. See the [raw sustained report](P00/app-benchmark-sustained-300s-645d3fec-3b8d-4e72-a876-1982d09977aa.json).

Transfer reports show 3,686,400 bytes/frame of CPU raster readback on JS and WASM; WASM uses an 11,059,200-byte/frame arena representation with zero explicit segment copies, but keeps the CPU capture cost. GPU texture mode reports no CPU raster readback/byte upload and returns a 32,776-byte compact packet; the 3,686,400-byte external-texture source value is a modelled lower bound. Hidden browser/driver copies and actual interconnect traffic are unknown.

## Proposal decisions

- **Conditional keep:** P01 source-gated texture capture; P05 optional WASM CPU-segment candidate; P07 Procamp and P08 Vidicon prototypes; P04 two-slot readback prototype. These are limited to their tested source/segment and have open integration gates.
- **Keep current policy:** P02 fused/validation behavior remains inconclusive; P03 retains current HUD/audio and monitor policy.
- **Do not promote:** P06 pointwise GPU grouping lacks a full-chain win; P09 keeps JS default; P12 worker scheduling loses on measured round-trip throughput.
- **Reject/defer:** P10 current GPU TapeWow fails fidelity and is rejected; P11 automatic segment planner is deferred for lack of multi-route costs and state migration.
- **Local regression closed, rollout open:** P13 now covers basic MP4 finalization and export/live-history isolation, plus a five-minute GPU file session. Output parity/cancellation, camera, physical devices, and deployed assets remain.

## Automated gates

The [latest automation run](automated-runs/2026-10-14T023028-816Z-50ab7305.json) passed **11/11 groups** on the clean matrix revision: 72 Node tests, 11 WASM conformance tests, both builds, JS/WASM/GPU route smokes, benchmark/worker/export browser tests, app-GPU integration, GPU kernel/temporal tests, and monitor/state handoff.

The acceptance matrix was assembled from nine validated raw reports after excluding overlapping fallback attempts and repeating runs 8–9 serially. The corrected utility then passed a clean-worktree **9/9 five-second controller smoke**, preserved as a [separate smoke manifest](P00/app-backend-matrix-2026-10-14T031111-921Z-12ffe1c0.json). The short smoke verifies orchestration, source/revision/backend/audio/HUD/fidelity checks and artifact finalization; it is not an acceptance benchmark.

## What is still required

The desktop browser confirms application processing, canvas/HUD work and a running audio context. It does not verify physical speaker audibility or display scan-out. No named Android/iPhone camera/thermal/memory run or deployed HTTPS asset/cache/fallback matrix is complete. Offline MP4 pixel/sample/timestamp parity, abort/repeated-export lifecycle, other accelerated filter racks, additional source/capture formats, and planner state migration also remain open. Consequently the overall product rollout decision is **hold**.
