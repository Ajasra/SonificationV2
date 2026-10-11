# Acceleration implementation progress

Updated 2026-10-11. Branch: `codex/video-acceleration`.

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
