# Video acceleration implementation and testing plan

Status: implementation started; Stage 0 is in progress. No WASM/GPU backend or performance acceptance is complete. Updated 2026-10-11. See [PERFORMANCE_PROGRESS.md](PERFORMANCE_PROGRESS.md) for implemented work and verification.

## Goal and scope

Deliver sustained 1280×720 processing and display at 60 fps on named desktop hardware and 30 fps on named physical phones, for a published set of supported presets. Preserve the image-to-sample mapping, chain order, filter history, and recording behavior. The user confirmed these desktop/phone targets. Arbitrarily long racks are outside a universal FPS guarantee.

The first delivery compares JavaScript, precompiled C++/WebAssembly, and WebGPU for TapeSat, TapeWow, and Moog Ladder. Subsequent integration promotes only measured winners. AudioWorklet redesign, WASM threads, 4K guarantees, approximate filter replacements, and 60 fps recording are outside this delivery. Current offline export retains its existing frame and audio timing.

## Architectural decisions

| Decision | Choice and reason | Alternative / limit |
|---|---|---|
| Reference | Existing JS algorithms, with explicitly tested correctness fixes before freezing fixtures | Existing snapshots alone do not establish current fidelity |
| CPU acceleration | C++ compiled ahead of time with Emscripten; scalar and `-msimd128` builds | AssemblyScript would require a port too; compiler vectorization cannot remove nonlinear dependencies |
| Numerical model | WASM starts with double intermediates/history and Float32 sample stores matching JS; no fast math | GPU f32 is a separate fidelity candidate, never presumed equivalent |
| GPU | WebGPU compute in WGSL, reusable resources and asynchronous pipeline creation | Capability detection must obtain an adapter/device; unsupported browsers use JS/WASM |
| Concurrency | One dedicated worker; at most one executing frame and one replaceable pending frame | Threads/shared memory deferred; do not add isolation headers for single-worker WASM |
| Backend selection | Session-level selection, then a measured segment planner | Moving each filter independently can lose all gains to transfers |
| Tooling | Retain Node tests; add Playwright for actual browser integration | Emulated browser engines and software GPUs cannot certify physical device FPS |

Tooling milestone pins exact Emscripten SDK, Playwright, browser binaries, and WebGPU type package versions in committed manifests/toolchain metadata. Do not use moving `latest` in reproducible builds. Existing locked versions are TypeScript 5.9.3, Vite 5.4.21 and mp4-muxer 5.2.2. No Emscripten/native compiler was found on PATH during planning; installation/build setup is required implementation work.

## Interfaces and invariants

Introduce a live processing session around the existing pipeline, leaving synchronous reference/export callers usable:

```ts
type Backend = 'js' | 'wasm-scalar' | 'wasm-simd' | 'webgpu';
type FrameIdentity = { generation: number; sequence: number; mediaTimeUs: number };
// The concrete frame payload is transferable VideoFrame where supported,
// otherwise owned RGBA ArrayBuffer plus width, height, and format metadata.
// Results contain identity, owned display output or GPU presentation handle,
// copied monitor/preview samples, timing data, and structured failure status.
```

Session operations: initialize capabilities and immutable chain snapshot; submit frame; apply versioned parameters; reset with explicit reason; dispose. Reject stale generations before presentation. A backend capability table describes supported filter, stream/color format, numerical fidelity status, and state-transfer support. Preserve original ordered audio/video segments, conversions, equalization placement, and audio-driven video dependencies.

Clock contract: `mediaTimeUs` identifies source frames; it does not become the filter clock. Add an explicit `processingTimeMs`, sampled at execution start from a shared monotonic origin (`performance.timeOrigin + performance.now()` minus the session origin), and pass it to every backend. Preserve the current processing-start clock behavior for live effects; fixtures inject an exact controlled clock. Offline/reference export keeps its existing clock policy until separately specified. Worker-delay and dropped-frame tests verify this distinction.

Bounded live result contract: a `MonitorPacket` contains owned `Float32Array(4096)` post-playback values, owned raw preview of `min(n,2048)` samples, separately bounded post/raw HUD traces produced by the current scope's exact selection formula, RMS/peak, sample rate, original stream length and frame identity. Playback value `i` is `stream[i * max(1,floor(n/4096))] || 0`; do not accidentally resample the already gathered packet a second time. Stage 0 freezes the HUD trace formula and its required length. Compare packet playback and traces against the current full-stream path. GPU/worker execution generates this payload from the complete processed stream; full-stream transfer is reserved for consumers such as export that actually require it.

WASM ABI processes complete contiguous audio segments using preallocated memory, node handles and explicit parameter revisions. Avoid a JS call per sample/filter chunk. Reuse buffers; handle memory-view invalidation if memory grows. Export versioned state for prototype comparison, with filter id, sample rate, history, phase, ring indices and random-control state. Do not promise cross-backend state transfer until its tests pass.

GPU buffers retain full serialized sample count and filter history. Initial experimental format: 8-bit unsigned, RGB interleaved, linear traversal. Other formats explicitly route to a supported backend. Preserve integer packing, clamping, rounding and color conversion; expand coverage before promoting additional formats. Live monitoring gathers the same 4096 sample indices as sound-camera.ts, raw preview indices and RMS/peak sampling as the reference. Offline audio selection is a separate contract.

Borrowed reference buffers remain borrowed: consumers must copy before retaining or transferring them. Document aliases rather than asserting a new ownership guarantee for processFrame. Keep live and export pipeline instances separate so seeking/export cannot mutate live history.

Current 2D contexts are acquired during main.ts startup. Choose renderer/context before acquisition when introducing WebGPU or transferring a canvas; use a separate prototype canvas first. Account for every CPU/GPU crossing in the planner, including monitor readback. Keep compatible segments resident; choose JS/WASM when transfers outweigh compute gains.

Frame dropping advances DSP only for processed frames, matching the current missed-callback behavior; record dropped frame identities. Close every replaced, consumed, stale or failed VideoFrame. Source/size changes and stop use generation cancellation. Device loss pauses presentation, preserves the last good image, releases resources and offers a restart on a fallback backend with an explicit state reset. Seamless recovery requires a separately validated state checkpoint design.

## Milestones and gates

| Stage | Deliverables | Exit gate |
|---|---|---|
| 0. Reference and measurement | Browser timing harness; immutable report schema; named preset/device matrix; pipeline state/alias tests; fix mutable enabled/config invalidation; document bypass-history behavior | Existing tests/build pass; reference fixtures reproducible; baseline includes complete 720p browser path |
| 1. Reproducible WASM | Pinned SDK/build scripts for Windows and CI; scalar/SIMD modules; parameter caching and reusable segment buffers; TapeSat, TapeWow, Moog ports | Clean checkout builds modules; scalar conformance passes; SIMD tested independently; assets load through Vite and deployed serving configuration |
| 2. Comparative GPU prototype | Separate GPU renderer; packing/unpacking; TapeSat saturation plus state-correct affine scans; TapeWow input history/delay gather and controlled modulation; GPU timing/readback accounting | Multi-frame fidelity and boundary tests pass or candidate remains experimental; end-to-end results compared against JS and WASM |
| 3. Live worker integration | Persistent session; transferable ownership; queue bound; generation cancellation; copied monitoring payloads; separate export state | Real-browser start/stop/source/resize/recording tests pass; no unbounded queue or stale display; fallback startup exercised |
| 4. Backend planner and compatible filters | Explicit support table; measured segment costs; GPU stateless filters, Vidicon, FrameDelay, CVI Slicer/Differentiator and CRT Bloom incrementally | Each promoted filter has conformance/state/resource tests; mixed rack retains order; planner beats or selects reference path |
| 5. Physical acceptance and rollout | Desktop/phone sustained reports; feature flag/backend override; serving smoke checks; regression/export evidence | Named device/preset matrix satisfies FPS, fidelity and lifecycle gates; rollback exercised |

Dependencies: 0 → 1; GPU prototype 2 follows reference/tooling setup and may run alongside WASM porting. Integration 3 follows proven candidates. Planner 4 follows integration; acceptance 5 follows the selected supported preset set. Make coherent commits per stage only after its applicable gate is verified; a failed candidate is documented, not promoted.

Suggested implementation boundaries (new paths are proposals):

- Reference/instrumentation: `src/engine/pipeline.ts`, benchmark scripts, new pipeline regression tests and browser fixtures. Fix both in-place structural edits and replacement config objects with unchanged structural keys; parameter revisions must point to current config objects.
- WASM: `native/dsp/`, `scripts/build-wasm.*`, `src/engine/backends/wasm.ts`, module conformance tests. Keep ABI and compiler metadata versioned together.
- GPU: `src/engine/backends/webgpu/`, WGSL kernels, standalone renderer and browser fidelity tests. Prototype without acquiring the production canvas context.
- Session integration: `src/engine/processing-session.ts`, worker entry, `src/main.ts`, monitoring boundary and export pipeline ownership.
- Acceptance: `tests/browser/`, `scripts/benchmark-browser.*`, immutable reports under `docs/performance-results/`. Test package/browser versions are pinned when introduced.

Start with TapeSat + TapeWow as one contiguous segment, and Moog as the difficult sequential control case. GPU Moog is deferred. Feedback has same-frame history writes; RF Tuner reads already modified pixels; Ruttetra/Scanimate have scatter collisions. Keep these on the reference backend until a dedicated order-preserving design passes tests. Never substitute ping-pong textures or unordered writes without proving equivalent behavior.

## Correctness testing

Extend the existing Node/VM harness for pure pipeline/reference tests. Use a WASM adapter harness for compiled modules and real browser tests for worker/GPU/canvas APIs.

- Inputs: constant colors, gradients, impulses, edges, extreme samples, odd dimensions and controlled random patterns. Cover every supported stream bit depth, signedness, layout and color law; unsupported GPU combinations must choose fallback.
- Stateful sequences: multiple frames and blocks of length 1, 2, odd sizes, 8191, 8192 and 8193; unchanged/changed parameters, same-object enabled toggles, reorder, source/size/sample-rate changes, reset, and independent live/export instances. Declare bypass semantics before writing expected results.
- Mixed racks: audio→video→audio, video→audio→video, disabled/all-video/empty chains, audio-dependent video and quantization at segment boundaries.
- Ownership: separate input/output, reused targets, input/output alias policy, copied retained monitor data, worker transfers, stale generation disposal and bounded resources.
- Random/time filters: controlled clock and identical random-control sequence supplied to both paths. Production randomness remains unchanged unless an explicit algorithm change is approved.

TapeWow fixture randomness uses a test-only xorshift32 generator with nonzero u32 seed, shifts 13/17/5 and conversion `u32 / 2**32`; record constructor and processing draw order. Serialize seed/PRNG state together with `noise`, `noiseTarget`, `noiseCount`, phases and ring state. Include all of this in fixture identity and test block splitting across random-target updates. Production presets with stochastic drift stay on JS until a compatible shared control generator or approved randomness policy is implemented; deterministic fixtures alone do not authorize replacing Math.random in the artwork.
- Fidelity: packing and unfiltered round trips require byte equality. Stage 0 records numerical tolerances per filter and format before porting; compare sample max/RMS error, pixel max/error distribution and history/phase drift over long sequences. Double-preserving WASM aims at exact results where operations permit; floating transcendental differences require documented bounds. GPU f32 must meet predeclared bounds and visual review; a failed fidelity gate retains experimental status. Do not relax thresholds to make a fast candidate pass.
- Browser faults: unavailable adapter, shader/module load failure, device loss, worker failure, invalidated source, stop during transfer, denied camera, background/resume, repeated flips and resize. Verify cleanup and defined restart behavior.
- Recording/export: exact seek and encoder timestamps, audio indexing/padding, abort cleanup, playback restoration, supported/unsupported codec handling, camera track ownership, and source export isolation. Add recorder mocks plus actual browser codec/recording checks.

Commands after implementation: `npm test`, `npm run build`, explicit WASM build/conformance scripts added in stage 1, and browser test/benchmark scripts added in stage 0/3. Stage reports state precisely which commands and physical checks ran. Planning alone closes no test gate.

## Performance protocol

Freeze preset definitions and source clips at 720p30/60. Measure JS, scalar WASM, SIMD WASM and GPU with identical inputs/settings. Include unfiltered control, TapeSat+TapeWow, Moog, compatible video rack, and mixed CPU/GPU rack. Preserve existing benchmark results as historical evidence; Node compute timings cannot establish displayed browser FPS.

Validate actual decoded frame dimensions and cadence, and camera track settings, rather than relying on requested constraints or the resolution selector. Use callback media timestamps/presented-frame counters to separate source omissions from application drops. A source delivering fewer than 30/60 fps cannot certify the corresponding target. Exercise file input and physical camera input separately.

Capture draw/readback, color conversion, stream encode/decode, filter computation, equalization, transfers/upload/readback, monitor/HUD and output presentation separately. GPU submission time is not execution time: use optional timestamp queries only when supported, plus complete-frame wall timings. Avoid adding a synchronization after every pass to the production path. Label presentation estimates honestly.

Each run: 10 s warmup, 60 s measurement, then 5 min sustained run. Reports include revision, source hash, preset/params, actual resolution, backend/feature support, build flags/SDK, browser/OS, CPU/GPU where available, device/power conditions, p50/p95/p99 completed processing latency, processed FPS, source/decode drops, application drops, long tasks, input latency and resource counts. Save reports under unique run ids; never overwrite the only baseline.

Proposed acceptance budgets for each named device/preset:

| Target | Processing p95 budget | Processed throughput | Application drops |
|---|---|---|---|
| Desktop 720p60 | ≤12 ms | ≥58.8 processed fps with a 60 fps source | ≤2% |
| Phone 720p30 | ≤25 ms | ≥29.4 processed fps with a 30 fps source | ≤2% |

These are engineering gates with presentation headroom, not measurements or universal hardware promises. Require correct output presentation, responsive controls and no backlog; record source/decode failures separately. Sustained runs must meet the same gates in each 60 s window. Publish the exact hardware and supported preset set. Test Chromium desktop plus browser fallbacks; physical Android Chrome and iOS Safari are separate acceptance entries. Browser emulation cannot replace phones.

Resource gate: bounded declared frame/delay history, no leaked VideoFrames/tracks, no monotonic resource growth after warmup and 20 start/stop/source/resize cycles. Record CPU heap when available and GPU resource counts/estimated allocated bytes; CPU heap does not measure GPU memory. FrameDelay history budgets must account for roughly 56 MiB for sixteen 720p RGBA frames alone.

## Rollout, risks and remaining decisions

Keep JS available behind a backend override throughout. Default remains JS until a candidate passes fidelity and full-path performance on its supported matrix. Rollback disables accelerated selection and restarts a reference session; preserve presets and exports. Deployment checks include WASM MIME/loading, HTTPS, worker assets, cache versioning and GPU failure behavior. Threads, if later justified, need a separate deployment/isolation review.

Largest risks: GPU numerical drift and recurrent boundaries, CPU/GPU transfer cost, shader startup, phone thermal limits, state migration and order-dependent video effects. If WASM or GPU fails the target, report the measured bottleneck and supported rack limits; reduced processing resolution or changed artwork semantics require a separate user decision.

Before final acceptance: name representative desktop, Android and iPhone hardware; freeze the guaranteed preset list; approve per-filter numerical tolerances based on reference fixtures. These decisions do not block stage 0 instrumentation and reference tests.

## Evidence and primary sources

Code evidence: `src/engine/pipeline.ts:82` chain invalidation, `:202` mixed segments and `:291` borrowed results; `src/main.ts:40` context acquisition and `:914` capture; `src/audio/sound-camera.ts` live sample selection; `src/record/offline-video-recorder.ts:174` export loop; `tests/regression.test.mjs:135` limited state tests and `:178` mixed order; `package.json:8` current Node harness. This plan extends stages 4–6 of IMPROVEMENT_PLAN.md.

The source line references above describe the planning baseline at revision `18730183210393bf695b7f216a25b06780d4fec5`; implementation changes may move them. Current implementation evidence is tracked in PERFORMANCE_PROGRESS.md.

Primary sources consulted 2026-10-11: [Emscripten SIMD](https://emscripten.org/docs/porting/simd.html), [Emscripten pthread deployment requirements](https://emscripten.org/docs/porting/pthreads.html), [WGSL specification](https://gpuweb.github.io/gpuweb/wgsl/), [WebGPU specification](https://gpuweb.github.io/gpuweb/), [OffscreenCanvas transfer constraints](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen), [video frame callbacks](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback). Compiler flags do not establish a speedup; WGSL has no native f64 arithmetic, and workgroup barriers do not synchronize all dispatched workgroups. Use a portable multi-dispatch scan with explicit history carry rather than assuming a CUDA scan can be copied directly.
