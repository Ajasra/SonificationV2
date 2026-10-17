# Next Acceleration Test Plan: Final Evidence Report

Date: 2026-10-14. Scope: proposals P00–P13 in [the test plan](NEXT_ACCELERATION_TEST_PLAN.md). This report separates tests that ran from proposal gates that passed. The desktop campaign is complete for the selected TapeSat route; the plan's broader hardware and rack acceptance remains open.

## Executive verdict

The best tested application route is experimental GPU TapeSat with source-specific fidelity-gated texture capture. In three clean, headed, matched 60-second runs, it processed the verified 1280×720 30 fps source at a median **29.985 fps** and **11.1 ms frame-path p95**; GPU fidelity passed 3/3. A separate five-minute headed run sustained **29.982 fps**, **10.7 ms p95**, and fidelity passed. These results meet the plan's numeric throughput and p95 gates for this route, source, and desktop configuration.

The JS reference held a median 29.999 fps but met the 25 ms p95 limit in only one of three repetitions. The WASM arena held a median 29.980 fps and met that p95 limit in two of three. WASM's p95 gain over JS varied by paired run, so retain it as an explicit CPU-segment candidate, not an automatic replacement. The GPU result is strong enough to keep the existing gated TapeSat route available on the tested source/device path. It does not justify a general filter planner or phone rollout.

Local automation passed **11/11 gates** on clean revision `af54041d566575aa38b7a698dfc97e3529cd671e`. Basic offline-export pipeline isolation and MP4 finalization now have a browser regression. P00 is closed for the tested local route; P01 is conditionally supported; no other proposal has met its full app/device acceptance criteria. Production-wide acceleration and rollout remain **not approved**.

## Matched application matrix

The [matrix manifest](performance-results/next-acceleration/P00/app-backend-matrix-2026-10-14T023648-698Z-9c075513.json) links all nine raw reports and the six paired comparisons. Each backend ran three measured 60-second sessions in counterbalanced order. The reports agree on source SHA-256 `8a3bed3a381a76f9c8dd81d6ffa9045272c285212417671119a7fed8cc6ae008`, clean revision, active backend exclusivity, active browser audio context at volume 0.25, HUD on, and profiling off. The source was independently verified by `ffprobe` as 1280×720 at 30 fps. The headed Chrome run used a manually entered AMD GCN-5 desktop label; exact adapter model was not captured.

The initial one-command matrix controller was interrupted after run 7; two overlapping fallback attempts were excluded. GPU and WASM runs 8–9 were repeated serially with clean build provenance. The acceptance manifest was assembled and checked from the nine selected per-run JSON reports. After correction, the one-command controller completed a **9/9 five-second clean-worktree smoke**; its [smoke manifest and raw reports](performance-results/next-acceleration/P00/app-backend-matrix-2026-10-14T031111-921Z-12ffe1c0.json) are preserved separately. That validates orchestration and integrity checks, not performance acceptance.

| Backend | Median processed fps | Median frame-path p95 | Three-run p95 range | ≥29.4 fps | ≤25 ms p95 | Fidelity |
|---|---:|---:|---:|---:|---:|---:|
| JS reference | 29.999 | 28.6 ms | 23.8–32.1 ms | 3/3 | 1/3 | N/A |
| Scalar WASM arena | 29.980 | 24.1 ms | 22.9–31.3 ms | 3/3 | 2/3 | N/A |
| GPU TapeSat | 29.985 | 11.1 ms | 10.4–11.9 ms | 3/3 | 3/3 | 3/3 |

GPU beat paired JS p95 by 21.0, 16.7 and 13.4 ms across the three rounds; paired fps differences were +0.067, -0.030 and +0.004. WASM paired p95 differences were -8.0, +2.7 and -0.9 ms, while fps differences were +0.062, -0.213 and +0.011. The p95 separation for GPU persisted in all three pairs. The JS/WASM comparison does not show a stable tail-latency winner.

The [five-minute headed run](performance-results/next-acceleration/P00/app-benchmark-sustained-300s-645d3fec-3b8d-4e72-a876-1982d09977aa.json) processed 9,003 frames over 300.285 seconds: 29.982 fps, frame-path p50/p95/p99 8.7/10.7/12.7 ms, fidelity passed, texture capture selected, HUD on, active browser audio context, and one missed-presented-callback proxy event. This closes the local five-minute GPU file-session gate. The callback metric is not proof of decoded-source drops or physical scan-out.

## Transfer and bottleneck result

At the reported application/API boundaries, JS and WASM each read back one 720p RGBA image per frame: **3,686,400 bytes/frame**. The WASM arena reports **11,059,200 sample bytes/frame** resident in its owned memory and zero explicit JS↔WASM segment copies; this is representation/accounting, not physical DRAM traffic. Its CPU image readback is unchanged, so arena integration does not eliminate the CPU capture cost.

The GPU texture route reports zero CPU raster readback and zero byte upload. It reports a **3,686,400-byte/frame external-texture input lower bound** plus a **32,776-byte compact monitor readback** per frame. The latter is an API-observed mapped packet. Do not sum the texture lower bound with observed host copies as if it were a measured bus total. Hidden import/staging copies, physical interconnect traffic, GPU-local shader traffic and compositor/display work are not observable in these reports. For the tested TapeSat route, the practical bottleneck reduction is avoiding the CPU full-frame raster readback and retaining the filter result on GPU until one bounded monitor packet is mapped.

## Proposal status and disposition

| Proposal | Work completed and result | Remaining gate / app decision |
|---|---|---|
| **P00 Baselines and attribution** | Clean local 11-gate automation, equal JS/WASM/GPU TapeSat controls, nine matched headed app runs, source/revision/audio/HUD checks, transfer ledger, and a clean five-minute GPU session. | **Local TapeSat route passes.** Physical audio/display and a second device remain external. The automated harness is not a general route-cost model. |
| **P01 Capture and upload** | The three matched GPU runs selected texture and passed sample/resident fidelity 3/3. Existing byte fallback also passed integration behavior when a generated browser fixture failed texture fidelity. | **Conditional per source/device.** Other capture surfaces, owned ImageBitmap/VideoFrame, camera and more device/source pairs remain. No zero-copy claim. |
| **P02 Fused dispatch / validation** | Existing counterbalanced dispatch and validation experiments were reviewed; app matrix uses fused processing and validation on. | **Inconclusive for optimization.** The new matrix did not repeat fused-on/off or validation-on/off. Keep validation on and preserve the fused control. |
| **P03 Monitoring and HUD** | 720p monitor-index conformance passed for playback, scopes/raw prefix, DOM meter and state. HUD/audio stayed enabled in the app matrix. Earlier HUD toggle runs were noisy. | **Keep current policy.** Demand-driven gathers, cadence variants, input responsiveness and non-720p index cases remain. |
| **P04 Ordered readback ring** | Two-slot Vidicon prototype was exact and 15–19% faster in short isolated 20-frame tests, with a bounded queue. | **Prototype only.** True reordered map completion, app generation/state ownership, audio order, shutdown and device-loss cases remain; do not enable it in the app. |
| **P05 WASM arena** | Full-app TapeSat WASM measured 3×60 seconds; median p95 was 24.1 ms vs JS 28.6 ms, but paired gains varied and fps was tied. Arena path records zero explicit segment copies. | **Conditional CPU-segment candidate.** Keep an override for matched further work; do not route automatically. Other segments/devices and physical bus measurements remain. |
| **P06 Pointwise/audio kernels** | CPU diagnostic shows Amplify is cheap and Shiftr dominates the tested chain; Shiftr is recurrent, not stateless. | **No accelerator promotion.** Matched JS/scalar/SIMD/GPU whole-chain app tests and Wavefolder WASM/GPU candidate are missing. Keep cheap Amplify on CPU; prioritize Shiftr only inside CPU/WASM segment experiments. |
| **P07 Spatial video** | Procamp prototype was byte-exact in tested parameters and faster in isolated upload/dispatch/readback runs. | **Procamp conditional inside a resident GPU segment.** No full application resident-rack win; Solarizer, Colorizer, Differentiator/CVI Slicer, CRT Bloom and ChromaSmear remain unported. Avoid one-node GPU islands. |
| **P08 Temporal video** | Vidicon history matched a 20-frame sequence including parameter edit and resize reset; isolated GPU p95 was lower in short focused runs. | **Vidicon prototype only.** FrameDelay GPU is unimplemented; lifecycle/state/resource-budget and app-rack proof remain. |
| **P09 Recurrent CPU optimization** | Synthetic Shiftr scalar WASM was faster than JS in short DSP timing; SIMD did not beat scalar. WASM TapeWow/Moog losses were observed in synthetic reports. | **Keep JS default.** Shiftr gains do not transfer automatically to app-level mixed racks; other EQ/dynamics/delay candidates remain. |
| **P10 GPU TapeWow** | Dry identity and wet JS conformance failed (dry max error 1.0; wet RMS 0.7213, max 2.0). | **Reject current port.** Timing is invalid; do not integrate. Revisit only after a fresh identity/state-correct kernel. |
| **P11 Segment planner** | The matched cost/control evidence now exists for one TapeSat route, not the three general legal route classes. | **Defer automatic planner.** It lacks multi-rack route cost, cross-backend state migration, capability invalidation and unsupported-path tests. Use explicit overrides/reference fallback. |
| **P12 Worker scheduler** | Three persistent Shiftr worker probes preserved exact output but round-trip p95 (16.5–32.9 ms) lost to JS (6.6–7.1 ms); responsiveness benefit was not established. | **No adoption.** No OffscreenCanvas/frame-worker lifecycle or application scheduler evidence. |
| **P13 Export and rollout** | New browser regression verifies WebM→AVC MP4 finalization (`ftyp`), progress, source restoration, stopped recorder and export-history isolation from live TapeSat state. Five-minute GPU desktop file session passed. | **Export/device rollout remains open.** Pixel/sample/timestamp parity, abort/repeat lifecycle, camera, physical Android/iPhone, deployed HTTPS assets and cache/fallback checks remain. |

## Automated verification

The latest [clean automation record](performance-results/next-acceleration/automated-runs/2026-10-14T023028-816Z-50ab7305.json) passed **11/11 gates** on the revision used for the matched matrix:

- Node suite: 72/72; WASM conformance: 11/11.
- Production and benchmark builds.
- JS, WASM-arena and GPU application-route smoke checks.
- Benchmark/worker/export browser tests; app-GPU integration.
- GPU kernel/temporal suite and separate compact-monitor/state-handoff suite.

The matched matrix utility passes `node --check` and the end-to-end 9/9 short smoke. It verifies 1280×720/30 fps with `ffprobe`, requires headed mode, checks clean revision/source hash/backend exclusivity/audio context/HUD/fidelity, retains raw outputs, and reports numeric performance gates separately from integrity status.

## Final application direction

The application now selects GPU TapeSat automatically only when WebGPU is available, a video file is loaded (camera input remains on JS by default), and the existing exact-rack eligibility checks pass: 1280×720, 44.1 kHz, 8-bit unsigned interleaved RGB, no blend/equalizer, and one enabled TapeSat filter. The GPU module is loaded only when that route is first eligible. At that point the app compares GPU output with the JS reference; any failed comparison or runtime error returns processing to JS. The existing `?gpu=js`, `?gpu=wasm`, and `?gpu=tapesat` benchmark controls remain available. This adopts the tested route in the application code; it does not constitute deployment or mobile/device rollout approval.

Keep JS as the reference and fallback. For the tested 720p30 desktop file path, GPU TapeSat is the only route that met the frame p95 target 3/3 and it remained stable for five minutes. Keep WASM arena as an explicit CPU-segment experiment because its full-route p95 improvement was inconsistent. Keep Procamp, Vidicon and the readback ring at prototype/conditional status. Reject the current GPU TapeWow port and worker scheduler; defer automatic planning.

For cross-hardware performance, the evidence supports this narrow policy: keep compatible stages on one owner, avoid full-frame CPU readback on the tested GPU texture route, and gather one bounded monitor packet. It does not yet prove this policy for other filters or mixed racks.

## Remaining external acceptance

No software-only run on this host can close the physical-device gates. Still required are named Android/iPhone sessions with camera, thermals, memory and physical audio; display scan-out/drop confirmation; additional capture formats/devices; export parity/cancellation/repeated lifecycle; and deployed HTTPS/version/cache/fallback testing. The adapter label was entered manually, and a running browser audio context does not establish audible speaker output.
