# Acceleration implementation progress

Updated 2026-10-12. Branch: `codex/video-acceleration`.

User application report ca63ac3b confirms 208 GPU frames, zero JS frames, passing sample/resident fidelity, unmuted audio at volume 0.8 with running audio context, and enabled HUD. Performance is below target: 27.9221 fps, 31.3 ms frame-path p95 and 15 presented-callback gaps (6.73% proxy). Only 7.4493 seconds were measured after warmup, so neither the 60-second nor sustained application gate closes. Preserve reported dirty-build provenance and unknown physical hardware. Next instrument capture/GPU/audio/telemetry and separate HUD RAF cost before choosing an optimization. See [application short-run analysis](performance-results/webgpu-prototype/USER-APPLICATION-SHORT-RUN.md).

Application reporting now retains measurement samples across settings and frame-loop resets, records reset timestamps/reasons and total session duration, and shows session/collected duration beside the FPS. It reports capture, preparation, GPU completion/readback, audio submission, telemetry update, remaining frame work and separate HUD render percentiles. These measurements are diagnostic; frame-path latency and measured wall-clock throughput remain the acceptance metrics. Focused real-GPU browser test and production build pass. A fresh user run is needed to identify the measured bottleneck.

User application report 8d022cc3 records 90.97 seconds session and 61.55 seconds measured across two post-warmup windows; GPU processed 1530 frames with no JS fallback. Throughput was 24.86 fps, complete frame-path p95 31.8 ms, and 124 presented callback gaps (~7.5% proxy). Fidelity passed. Audio was muted and adapter identity blank, so this is not active-audio or named-device acceptance. Capture p50 was 8.2 ms, GPU completion/readback p50 14.8 ms, and separate HUD render p95 3 ms. See [application run analysis](performance-results/webgpu-prototype/USER-APPLICATION-8D022CC3.md). Prioritize capture/readback and trace the recorded loop resets.

Frame-loop stops are now idempotent when no callback or frame is active, and actual stops record their caller (source replacement, video restart, snapshot, offline recording, camera or page visibility). Build and focused real-GPU application test pass. This should avoid duplicate stop/reset events and identify the cause of future measured-window restarts; it does not change the GPU processing algorithm or establish a speedup.

Follow-up user report 08f69665 is a more representative 720p application run: audio unmuted/context running, HUD enabled, 89.77 seconds session and 71.26 measured seconds, all 1972 measured frames on GPU, fidelity passed. It averaged 27.67 fps with frame-path p95 32.7 ms and 165 callback gaps (~7.7% proxy), so the target still fails. It records no frame-loop stops and one settings reset at 8.51 seconds. Capture p50/p95 is 8.1/10 ms; GPU completion/readback p50/p95 is 15/22.8 ms; audio submission p95 is 0.2 ms. See [full application run analysis](performance-results/webgpu-prototype/USER-APPLICATION-08F69665.md). Next optimize capture/upload and investigate ordered asynchronous GPU readback without weakening fidelity.

Adaptive app capture now selects exact texture capture only when the existing fidelity probes pass; otherwise it lazily reads and uploads the exact reference bytes. The local decoded-video probe failed by two byte levels, so this machine retains reference-byte mode and shows no measured speedup yet. See [adaptive capture implementation evidence](performance-results/webgpu-prototype/ADAPTIVE-APP-CAPTURE.md). Build, ten targeted unit tests, the real GPU app test and all six dedicated GPU browser tests pass. Next report must identify capture mode; continue with fallback-path costs unless a named device passes texture fidelity.

Short application report `e73ad8fc` confirms a severe regression: 9.83 fps over 24.41 measured seconds, 83.4 ms frame-path p50, and 489 presented callback gaps. The byte-exact texture gate failed and correctly selected reference bytes. Capture p50 rose from 8.1 to 24.5 ms compared with `08f69665`; GPU-stage timing also includes this lazy capture and double-counts it. Adapter identity is blank and the build revision is stale/dirty, so the cause is unproven. Follow-up isolates fidelity probing on a detached canvas to protect the live readback surface and corrects stage attribution. Focused app tests and build pass; a matched 60-second run is needed to determine whether throughput recovers. See [short application run analysis](performance-results/webgpu-prototype/USER-APPLICATION-E73AD8FC.md).

The matched follow-up `5b0bba0b` sustained 9.39 fps over 101.86 measured seconds: 956 GPU frames, 2055 callback gaps, frame-path p50/p95 83.5/99.5 ms. Capture remains 24.2 ms p50 despite detached fidelity probing; GPU completion/readback is 59.3 ms p50 after corrected stage attribution. Sample/resident fidelity pass; exact texture fidelity still fails and reference-byte mode remains selected. This rejects the live-canvas-probe explanation for high capture cost and establishes a persistent app-path regression. Adapter identity is blank. Next investigate CPU pixel read and GPU completion/readback separately; prototype bounded ordered readback pipelining and fewer dependent scan passes only with state/audio/pixel fidelity preserved. See [sustained application analysis](performance-results/webgpu-prototype/USER-APPLICATION-5B0BBA0B.md).

The GPU recurrence now uses a hierarchical affine summary scan at the target 720p size: two dependent summary-scan dispatches per filter stage replace 14, and the large per-sample auxiliary scan buffer is removed on this path. A general scan fallback remains for larger summary arrays. Build, nine focused Node tests, six Chrome WebGPU fidelity tests and two Chrome app GPU integration tests pass. No speedup is claimed until the same user-device 720p run is repeated. See [hierarchical scan experiment](performance-results/webgpu-prototype/HIERARCHICAL-SCAN.md).

Application integration is implemented behind ?gpu=tapesat: separate GPU presentation canvas, reference-byte capture, live audio/HUD compact mapping, state handoff, serialized frames, source/device failure fallback and downloadable application reports. Normal startup remains JS. See [application integration](APPLICATION_GPU_INTEGRATION.md). Real installed-Chrome functional tests exercise audio/HUD, format/resolution fallback/recovery and source replacement; user MP4 full application performance and phones remain open. Compact readback grows from 24,576 to 32,776 bytes for raw HUD preview and state, so the earlier benchmark result does not automatically certify the current integrated path.

Five-minute user MP4 report cfa78a3a closes the supported TapeSat benchmark gates: 30.0006 fps over 300.0272 seconds, complete-path p95 20.7 ms, zero presented-callback gaps/long tasks, implemented fidelity preflight passed using reference-bytes capture. See [five-minute analysis](performance-results/webgpu-prototype/USER-BYTE-FALLBACK-300-SECOND.md). Advance to real application audio/HUD integration with JS fallback; production promotion, other presets and physical-phone acceptance remain open.

User MP4 byte-fallback report 95bb5341 passed all implemented fidelity fixtures. Over 60.0311 seconds: 29.1849 fps, complete-path p95 20.4 ms, 34 callback gaps (~1.904% proxy), zero long tasks. Benchmark latency passes; strict throughput >=29.4 fps narrowly fails. Full application, five-minute sustained and phone gates remain open. See [60-second byte-fallback analysis](performance-results/webgpu-prototype/USER-BYTE-FALLBACK-60-SECOND.md). Keep production on JS until remaining gates close.

User diagnostic 52a7e061 isolated sparse one-byte capture differences (280 synthetic and 248 source samples), while equal-byte compact history passed. Added automatic reference-RGBA upload fallback, GPU byte unpacking/serialization and retained texture probe diagnostics. Limits are unchanged; capture, filter, pixel and gather checks must pass again before measurement. Browser settings are preserved. GPU tests cover deliberately altered canvas readback and decoded-video runs in both capture modes. User MP4 performance remains pending.

Resident fidelity follow-up: user report 455b4b8d-d2cd-46cf-987e-6cc5e89df075 passed the sample-only gate but failed resident samples (max ~0.0134), pixels (max 255), and compact gathers. Corrected swapchain diagnostic lifetime using an owned render texture. Installed Chrome exposed an AMD GCN-5 adapter here; real GPU tests reproduced the decoded-video RGB conversion mismatch and now pass with reference RGBA raster capture and a byte-frozen repeated-frame fixture. Added npm run test:gpu. The user's adapter/MP4 still needs verification; limits were not loosened.

2026-10-12 capture follow-up: the user's next error showed ImageBitmap creation also failed before playback. Corrected preflight sequencing to play, wait for a delivered video frame, freeze one bitmap, then pause and compare that same bitmap on CPU/GPU. Real browser video snapshot lifecycle and cancellation/late-result cleanup are covered. Physical MP4 capture/color validation and resident FPS remain pending.

2026-10-12: implemented a separate GPU-resident benchmark path, compact playback/preview gathers, capture/render preflight, buffer/texture reuse and a parallel workgroup tile scan. New shader/color-path and performance evidence are pending the next physical-browser run. The original CPU capture/readback GPU mode remains available for comparison. These changes do not promote the production backend.

The first resident diagnostic (`benchmark-8eff03a8-98c6-4a97-834c-aac55f1f0166.json`) confirms the new parallel scan passed its sample fixture (worst max error 9.656e-6), then failed direct paused-video texture import with no backing resource. Original report is preserved under performance-results/webgpu-prototype. Capture now uses an owned ImageBitmap snapshot for video, reports snapshot time and closes it on success/failure. This compatibility fix remains pending physical-browser verification; no resident FPS or rendered pixel acceptance is claimed.

Subsequent 60-second NVIDIA Ampere report passed the implemented GPU sample fidelity fixture (worst max error 7.272e-6 against limit 1e-4). Performance remains below target: 16.80 fps, 51.9 ms complete-path p95, completion/map wait 33 ms p95. See [60-second analysis](performance-results/webgpu-prototype/60-SECOND-ANALYSIS.md). This validates the fixture on one adapter; full pixel/application/phone acceptance is still pending.

First physical desktop GPU report received: NVIDIA Ampere, TapeSat-only, 20.73 fps, 39.3 ms p95 over approximately 10 seconds. Shader execution is confirmed on that adapter; fidelity, 720p30, sustained and phone gates remain open. Original report and analysis: [WebGPU results](performance-results/webgpu-prototype/ANALYSIS.md).

GPU benchmark runs now enforce a sample fidelity preflight on the selected adapter before warmup. Reports include its result and, when profiling is enabled, wall-clock serialization, preparation/submission, completion/map wait, mapped copying and decoding timings. Mocked preflight tests cover pass, excessive error and cancellation; they do not establish GPU numerical fidelity. The next physical-browser run must supply that evidence.

Current target: sustained 720p30 on desktops and phones, with p95 processing ≤25 ms, throughput ≥29.4 fps and application drops ≤2%. The user confirmed the initial test video is 30 fps. This supersedes the original desktop 60 fps target.

## WASM prototype slice

The scalar/SIMD comparison is implemented in [WASM_PROTOTYPE.md](WASM_PROTOTYPE.md). TapeSat, TapeWow and Moog now have precompiled experimental backends, reproducible toolchain/build metadata and dedicated conformance tests. The benchmark exposes individual tape cases and backend selection; application defaults stay on JS. Controlled TapeWow fixtures are implemented, while production randomness remains unchanged.

Exploratory synthetic browser measurements did not close the 25 ms budget for the tape pair or Moog. The latest pair measurement was JS 43.6 ms, scalar WASM 39.8 ms and SIMD WASM 43.9 ms p95 for the synthetic CPU path. Moog remained above 100 ms. These are short headless comparisons, not the user's video/physical-device acceptance. GPU-compatible processing and capture deserve the next prototype; WASM is not promoted on these results.

## Stage 0, first implementation slice

Implemented:

- Chain invalidation detects edits made to the same arrays/config objects, including enabled state, order, type and audio sample rate. Replacement configs refresh parameter references without recreating compatible instances.
- Bypass freezes a node's history; reorder preserves it. Removing a node, changing its type/rate, or resizing a video node invalidates incompatible history. Disabled nodes are not instantiated just for bypass.
- Pipeline audio/preview views are documented as borrowed. Input/output memory overlap is rejected because preserving the original image is required for blend and mixed segments; disjoint views of one buffer remain supported.
- Optional pipeline profiling reports setup, color and stream conversions, audio/video DSP, audio levels, equalization and blend. An optional effect clock supports controlled fixtures; the default remains processing-start time.
- Development browser harness at `/benchmark.html` runs local video through capture/readback, the reference pipeline and output canvas. Reports include source SHA-256, preset parameters, source/output dimensions, build revision/dirty state, percentiles, processed callback throughput, missed presented callbacks and long tasks where available.
- Playwright 1.64.0 is pinned. Its real Chromium smoke test generates a local 720p video, decodes it, completes a measured run, checks JSON download and cancellation, and attaches the report to test output.

Verification:

| Check | Result |
|---|---|
| `npm test` | 41 tests passed |
| `npm run test:browser` | 2 Chromium tests passed |
| `npm run build` | Passed |
| `npm run build:benchmark` | Passed |
| `git diff --check` | Passed |

The browser test is a functional smoke test using a short synthetic video, 10-second warmup and 1-second measurement. It is not a reproducible hardware performance baseline or device acceptance. Benchmark reports exclude live audio, application HUD, recording, actual display-completion confirmation and camera input. Callback gaps cannot distinguish decoding failures from every source omission. TapeWow benchmarks use production randomness; controlled stochastic conformance is still pending. Profiling itself adds overhead; compare unprofiled runs for throughput.

## Running the reference harness

1. Run `npm ci`. For browser tests, install the pinned runner's browser with `npx playwright install chromium`.
2. Run `npm run dev:benchmark`, then open `http://127.0.0.1:5175/benchmark.html` on this computer. The separate server binds only to loopback. Phone access needs the normal HTTPS development/serving setup in a later integration step.
3. Select a known local 720p30 source and preset. Use 60 seconds for measurement or 300 seconds for a sustained reference run. A requested target does not establish source cadence.
4. Download JSON, preserving its unique run id. Record physical hardware/power conditions alongside it. Build revision and dirty status are captured at server/build startup; restart after code changes before comparing runs.

`npm run build:benchmark` produces a separate `dist-benchmark/` artifact; it is not included in the application's production bundle. `npm run test:browser` starts the benchmark server if needed and keeps generated reports under ignored test output.

## Remaining gates and next work

User desktop results are preserved in [performance-results/2026-10-11-desktop-js/ANALYSIS.md](performance-results/2026-10-11-desktop-js/ANALYSIS.md). Short profiled runs measured approximately 30.07 fps unfiltered, 15.03 fps for TapeSat+TapeWow and 7.51 fps for Moog. The user confirmed the source is 30 fps; the historical reports selected 60 fps. Unfiltered timing is within the revised 25 ms budget; DSP dominates the filtered runs. Capture remains a secondary cost. These are provisional references, not sustained or physical-phone acceptance.

Stage 0 and Stage 1 remain in progress. Deterministic TapeWow fixtures, block-boundary tests and declared prototype tolerances are implemented. Still required: broad format/parameter fidelity coverage; complete live application timing including monitoring/HUD; named source/preset/device matrix; immutable 60-second browser baselines and five-minute runs; serving/deployment smoke checks and production stochastic/state policy. Offline export state isolation remains integration work.

The Emscripten toolchain and scalar/SIMD ports are now pinned and implemented. Next compare longer matched video runs and develop the compatible WebGPU prototype. No backend promotion or desktop/phone FPS acceptance has been claimed.
# WebGPU TapeSat continuation

An isolated experimental TapeSat backend and benchmark selector now exist. The algorithm scans affine tile summaries and retains bump/tone state across frames. CPU capture, full upload/readback and canvas output remain included. GPU fidelity and speed are pending: this environment exposes no WebGPU adapter, so the dedicated browser fixture skips explicitly. See [WEBGPU_PROTOTYPE.md](WEBGPU_PROTOTYPE.md) for declared tolerances, limitations and remaining gates. No production backend promotion has occurred.
