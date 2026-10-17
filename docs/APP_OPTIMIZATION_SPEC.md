# App optimization implementation SPEC

Date: 2026-10-14
Status: M6 release candidate accepted under user-directed device assumptions; production rollout not deployed.
Executor: Luna, working sequentially through the milestones below.

## 1. Outcome and authority

Deliver useful acceleration for complete live application racks, with correct images, audio, state and fallback. The first release expands beyond single-filter TapeSat to a reusable spatial-video segment. Keep working JS presets usable throughout.

This SPEC controls the next optimization implementation. It replaces the execution order and open-ended experiment checklist in `NEXT_ACCELERATION_TEST_PLAN.md` and the performance proposals in `PERFORMANCE_IMPLEMENTATION_PLAN.md` and root `SPEC.md` T04–T07. It does not replace their product invariants or historical evidence. Worker adoption, automatic resolution changes, audio scheduling changes and a general backend optimizer are outside this release.

The unit of delivery is an application route serving a family of racks. Verify each newly ported filter for correctness; benchmark the complete route. Do not run a sustained performance campaign for every filter or every parameter.

Success means all of the following:

- A user can run a supported multi-filter video rack with audio and HUD, without a GPU round trip between its video nodes.
- A mixed CPU/GPU rack has explicit transfer boundaries and falls back safely when it cannot benefit.
- The app exposes enough diagnostic evidence to identify the next bottleneck without another instrumentation project.
- At least one new multi-filter route passes the benefit gate in section 7. Implemented but slower routes remain experimental or are removed.
- Remaining slow presets, unsupported devices and release checks are named explicitly. This SPEC does not promise 720p30 for every possible rack.

## 2. Starting evidence and code

Read this section and the current files before editing; do not restart P00–P13.

| Existing work | Use in this implementation |
| --- | --- |
| Headed 720p30 matrix: JS 28.6 ms, WASM 24.1 ms, GPU TapeSat 11.1 ms median frame-path p95; all near 30 fps | TapeSat GPU is the demonstrated complete-route win. WASM advantage was inconsistent. See `NEXT_ACCELERATION_TEST_REPORT.md`. |
| GPU TapeSat five-minute run: 29.982 fps, 10.7 ms p95 | Preserve as evidence for its recorded revision/source/device; do not repeat it after documentation-only changes. |
| `src/engine/pipeline.ts`, `src/engine/chain.ts` | Reference semantics, ordered audio/video segments, cached filter history, optional timing, caller-owned output, WASM arena hooks. |
| `src/engine/backends/webgpu-tapesat.ts`, `app-tapesat.ts` | Reuse source fidelity gating, resident DSP/presentation, compact monitor readback and TapeSat state handoff. |
| `webgpu-procamp.ts`, `webgpu-vidicon.ts` | Isolated prototypes. Each currently creates its own device and reads back full pixels; these wrappers cannot simply be chained in the app. |
| `src/engine/backends/wasm.ts` | Existing scalar arena and TapeSat/Shiftr ports. `processSegment` requires filters from the same runtime. State export exists; generic state import does not. |
| `src/main.ts`, `gpu-eligibility.ts` | Current route only accepts one TapeSat at 720p, RGB unsigned interleaved 8-bit, 44.1 kHz, no equalize/blend. Pending automatic selection has no tested-device rollout boundary. |
| `scripts/benchmark-app-gpu.mjs`, `benchmark-app-matrix.mjs` | Reuse and extend. Current runner assumes TapeSat and exclusive JS/WASM/GPU counts; it cannot certify a mixed rack unchanged. |
| `scripts/test-acceleration.mjs`, `test-gpu-browser.mjs` | Reuse existing test groups and split GPU processes. The former duplicates WASM conformance already included in its Node glob; avoid duplicate execution in the new acceptance workflow. |

GPU TapeWow failed fidelity; the worker probe lost throughput. Do not reopen either in this implementation. The existing worktree contains code, tests and reports from earlier work: preserve it, record the starting diff, and never stage or revert it wholesale.

## 3. Architecture: a small set of legal routes

With no backend argument, compile the route from the resolved chain and capability constraints. Prefer an eligible resident GPU rack, then the maximal supported final GPU video suffix, then an eligible GPU TapeSat route; use CPU for unsupported chains or unmet device/source/format constraints. Explicit backend arguments remain useful for comparison and diagnostics. Do not build a per-filter cost optimizer, runtime benchmark-on-startup, or per-frame backend switching. This automatic mode does not require a release flag; device and route eligibility plus runtime fidelity fallback govern selection.

Keep implementation availability separate from route selection. `GPU_FILTER_CAPABILITIES` is the pipeline-visible inventory of filters with an app GPU executor. It currently includes TapeSat audio plus Procamp, Solarizer, Colorizer, CVI Slicer and Differentiator video. Entries identify media type, executor and shared segment. The route planner consumes video capabilities to find the maximal supported suffix, then applies format, source, fidelity and route-specific constraints. A parity-correct GPU implementation remains available for composition even when its standalone speed matches CPU. This inventory is capability metadata, not proof of parity or a performance claim.

Current default policy supersedes the release-gated behavior described in the historical M0/M6 evidence below: with no `gpu` query argument, an eligible GPU route is selected automatically. GPU validation remains route-aware, and explicit `?gpu=js` preserves the CPU reference comparison.

| Route ID | Execution | Scope |
| --- | --- | --- |
| `cpu-reference` | One CPU capture; existing ordered JS pipeline; existing presentation | Every supported preset. Always available. |
| `gpu-tapesat` | Existing gated source path, TapeSat, GPU presentation, compact monitor | Preserve the existing exact-rack route and controls. |
| `cpu-gpu-video-tail` | CPU executes everything before a supported final video suffix; upload RGBA once; GPU executes that suffix and presents | First new mixed route. No GPU-to-CPU full-frame readback in live processing. |
| `gpu-resident-rack` | Gated source capture; implicit identity audio stage or one TapeSat; supported video suffix; GPU presentation; one compact monitor map | Main performance target after the suffix integration works. |
| `wasm-cpu` | CPU capture; serialize directly into one WASM arena; an entirely supported deterministic audio segment; deserialize once | Optional bounded experiment after the GPU deliverable. Unsupported audio segments stay entirely on JS. |

The shared tail currently has GPU implementations for Procamp, Solarizer, Colorizer, CVI Slicer and Differentiator. Preserve order, repeated instances and per-node byte rounding. A suffix is the maximal consecutive supported video nodes at the end of the active chain; it may start inside a larger video segment. Earlier unsupported nodes stay in the CPU prefix. A single supported node can be tested through the same route, but is not evidence that the multi-filter deliverable is done.

Examples:

- `TapeSat -> Procamp -> Solarizer -> Colorizer`: resident GPU candidate; CPU-prefix/GPU-tail is its fallback candidate; whole JS remains the reference.
- `Moog -> Procamp -> Colorizer`: Moog stays CPU; one final GPU upload may help video work. Report Moog's remaining cost; do not promise this reaches 30 fps.
- `Procamp -> Moog -> Colorizer`: CPU executes Procamp and Moog; only the final Colorizer is a possible GPU tail. If its complete route does not win, use whole JS.
- `Procamp -> Moog`: whole CPU. GPU Procamp followed by full-frame readback is outside this release.
- `Shiftr -> TapeSat`: optional all-WASM audio-segment experiment. `Shiftr -> Wavefolder` stays JS because Wavefolder has no approved WASM port.

JS and WASM both run on the CPU. The relevant WASM cost is representation/copying and calls, not a hardware GPU transfer. This release avoids partial JS/WASM splits inside an audio segment. Sharing an arena with arbitrary JS filters can be future work only if measured need justifies preserving the reference chunk order across those splits.

For every GPU segment use one app-owned GPU device, pooled frame resources, and ordered passes. Extract reusable encode/dispatch operations from prototypes; keep their standalone test wrappers if useful. Do not request a device, allocate a full frame, upload or map after every filter. Kernel fusion is optional later; first remove per-node ownership transfers.

### Route and frame contracts

Add small modules under `src/engine/backends/`; suggested names are `route-policy.ts`, `app-rack.ts` and `webgpu-video-segment.ts`. Extend existing modules where clearer. No new execution framework or dependency is needed.

- `RoutePlan`: route ID, ordered prefix/suffix node IDs, eligibility/fallback reason, structural key, supported format/dimensions, expected transfer boundaries and state owners.
- `FrameToken`: source generation, preset revision, dimensions and sequence number. Capture parameters once for an in-flight frame.
- `FrameResult`: CPU image or GPU presentation ownership, audio/raw-monitor views, audio level context, token and diagnostics. GPU presentation must not force `outputRgba` readback merely to satisfy the CPU result type.
- Required internal split API: `processPrefix(plan, input, width, height, preset, outputTarget, token, options)` returns `{ rgbaAtBoundary, audioSamples, rawAudioSamples, videoContext, lastAudioLevels, originalInput, token }`; `processCpuTail(plan, prefixResult)` finishes only the selected video suffix. Both share the existing compiled pipeline/cache. Invoke the prefix exactly once per frame; the CPU tail runs only when selected or when the GPU tail fails. The prefix includes the implicit audio stage and final-audio equalize/blend whenever they precede the suffix. An opaque pipeline-owned frame handle may carry these fields, but it must not hide a second full-chain call.
- Route structure changes only for source/format/dimension/order/enabled/backend-capability changes. Parameter changes update uniforms/LUTs and any required fidelity status. No allocation/replanning merely because FPS changed.
- Borrowed CPU/WASM views live until the next processing call. Consumers retaining them must copy their bounded payload. Keep one frame in flight; no new readback ring or speculative frame queue.
- Compatibility keys include reader/writer settings, bus rate, blend/equalize, view and recording mode. Begin new GPU routes at the existing 720p/44.1-kHz/RGB format envelope, file input, synchronized developed view. Unsupported combinations use JS.

## 4. Semantics that must survive integration

1. `resolveChain` order is authoritative. Keep implicit empty audio processing for all-video/empty racks: it supplies reader/writer behavior, sound and raw preview.
2. Keep each audio/video conversion and intermediate clipping boundary. Audio output comes from the last audio segment, even when video filters follow it. Do not regenerate sound from the final colored image.
3. Raw preview comes before the first audio DSP segment. Playback, scopes, raw preview and DOM levels keep their current sampling indices. For the initial 720p GPU route reuse the existing compact layout and append versioned fields if necessary.
4. Video modulation uses the latest preceding audio segment's RMS/peak, or previous-frame levels if video precedes audio. For a resident route, compute same-frame levels before video passes with the reference sampling rule; do not substitute the playback sample subset or previous-frame telemetry. A reduction's arithmetic and threshold behavior must pass fidelity checks.
5. Equalize/blend still occur after the last audio segment using the original input for blend. Initial GPU eligibility may reject these settings; rejection must choose the complete JS route.
6. Node IDs own cached instances. Preserve each reference filter's actual state transitions, including resets in `setParams`; do not infer continuous history merely from a retained instance. Bypass/reorder/removal/type/rate/video-size behavior must match the reference. Keep live and offline pipeline instances separate.
7. Splitting a CPU prefix must retain the full chain's instance cache and final-audio/has-video semantics. Do not construct a truncated preset every frame or call `processFrame` twice on the same stateful prefix. Add a narrow prefix/tail execution boundary to the existing pipeline, sharing its compiled chain.
8. If GPU tail processing fails after CPU DSP ran, execute only the remaining stateless tail on CPU using the retained prefix output and frozen frame context. Audio and DSP advance once. Do not restart the complete frame through JS. Resident TapeSat failure uses its pre-frame CPU checkpoint and commits the returned state only once.
9. Discard stale asynchronous presentation/audio results after source replacement, stop or incompatible edits. A failed route is disabled for that capability/source generation; do not repeatedly initialize or probe a failed shader each frame.
10. Before live recording, snapshots or offline export need a CPU canvas/image, select the reference route at a frame boundary and preserve TapeSat history. Verify the first captured frame is current. Export always uses its own pipeline. No hidden GPU readback path is added to recording in this release.

New spatial kernels preserve byte-exact output. Extract shared CPU LUT/parameter generation where it prevents JS/WGSL differences: Solarizer already builds a 256-byte LUT; Colorizer has byte LUTs and integer luminance. Upload LUTs only on effective parameter change. Preserve Colorizer's final mix rounding and Procamp's same-frame audio-peak gain. Do not replace JS double arithmetic with WGSL f32 and assume equivalence. If a kernel fails the declared parity contract, exclude it and record the failure; never loosen tolerances to meet a deadline. TapeSat retains its existing declared sample/pixel bounds.

Extend fidelity preflight to the composed route, using isolated reference/candidate state and the same frozen input. Cache success by source/capture/route/format and effective preset kernel settings. Per-frame audio levels/time are covered by conformance fixtures and must not invalidate that cache every frame. Parameter edits that invalidate the proof use the reference path while one coalesced recheck runs; they must not queue repeated probes during slider movement. Preflight must not advance live DSP history. Source texture fidelity and filter-chain fidelity are separate checks. Parameter/rounding edge fixtures remain necessary even when one source snapshot passes.

## 5. Fixed workload set and bottleneck decisions

Create frozen preset JSON fixtures under `tests/fixtures/app-optimization/`. Use existing descriptor defaults initially, unique instance IDs and explicit `chain` order; hash the actual definitions. Freeze one verified 1280x720 30-fps clip. Reuse the prior source if present; if absent, create a deterministic local clip with FFmpeg and record command/hash. A different source begins a new comparison cohort.

| Fixture | Purpose | Performance candidates |
| --- | --- | --- |
| R0: empty rack | Capture/monitor/presentation overhead and ordinary JS regression | JS only; short regression check |
| R1: TapeSat | Existing winning route regression | JS vs existing GPU; reuse valid historical evidence where unchanged |
| R2: Procamp -> Solarizer -> Colorizer | First multi-filter video deliverable, including implicit audio | JS vs GPU tail; later resident identity-audio route |
| R3: TapeSat -> Procamp -> Solarizer -> Colorizer | Reuse resident DSP with a video rack | JS vs GPU tail vs resident route during screening; accept only the selected winner |
| R4: Shiftr -> TapeSat | Heavy deterministic CPU/audio segment | JS vs scalar arena, only in M5 |
| R5: Procamp -> Moog -> Colorizer | Mixed-order correctness, expensive CPU and transfer overhead | Whole JS vs GPU tail screening only; no presumed win |

Fallback tests also vary non-RGB format, resolution, blend/equalize, disabled/reordered nodes, unsupported video filters, source replacement and recording. These are correctness cases, not a sustained Cartesian benchmark matrix.

Use one short profiling pass per newly affected workload to choose work. Then turn profiling off for comparisons. Report capture, setup/conversion, CPU DSP/video, upload, GPU completion, monitor/audio submission, presentation and HUD separately where observable. Do not add percentile values together or count capture inside GPU wait a second time.

Decision rules:

- CPU capture/conversion dominates: prefer an already eligible resident route; do not port unrelated filters.
- CPU DSP dominates: take one measured expensive segment into the bounded WASM experiment. A GPU video tail cannot eliminate that DSP cost.
- Video processing dominates: use the shared GPU suffix; choose the next kernel by its share of the real slow rack.
- Transfers/synchronization dominate: reduce boundaries or choose CPU. Do not add a GPU island.
- UI/setup dominates: one bounded cache/allocation fix may replace the optional M5 experiment. Check effective parameter changes before skipping `setParams`; same-object edits and randomness must still work. Do not rewrite the UI or add workers.
- Already meets the target with no meaningful new benefit: stop tuning that workload.

Diagnostics must identify actual route/node ownership, fallback reason, bytes uploaded/read back, map/submission counts and allocated-resource high-water marks. Browser/driver hidden copies remain unknown. Report the full frame path on both normal and forced routes with the same timing boundary; current normal JS timing must not be compared with full-path GPU timing unchanged.

## 6. Sequential implementation milestones

Execute one milestone at a time. After its checks pass, update section 9 with files, result, evidence and next step. Make an atomic local commit of the coherent slice when committing is authorized; preserve pre-existing edits and never push/deploy as part of an implementation test. A clean isolated snapshot is also acceptable benchmark provenance.

### M0 — Establish controls and finish the release boundary

Scope: `gpu-eligibility.ts`, relevant `main.ts` route/report code, existing app benchmark scripts, frozen fixtures and targeted tests.

- Put automatic acceleration behind one release configuration flag, default off until M6/device acceptance. Preserve `?gpu=js`, `?gpu=wasm`, `?gpu=tapesat` controls. Explicit experimental overrides still require fidelity/capability checks.
- Extend the existing runner to accept `--preset <json>` and `--route <id|auto>` while retaining legacy options. Inspect actual selected route rather than badge text alone. Forced unsupported routes produce an explicit unsupported/fallback result; do not label them successful GPU measurements.
- Report source/preset hash, code/build identity, capture mode, actual route, route changes and inclusive frame-path timing. Mixed frames use a route ID and stage ownership; counts must still sum to processed frames once.
- Extend the matrix controller with `--preset`, `--baseline <route-id>`, `--candidate <route-id>`, `--phase <screen|accept>` and `--output-dir` for the selected pair and bounded phases in section 7. Preserve checkpoints; include slow routes in results. The current `duration * 20` minimum frame-count integrity rule must not classify a valid slow CPU control as a harness failure; use measured duration/route/source integrity separately from FPS acceptance.
- Run one five-second harness smoke, with R2 on JS, and existing focused TapeSat selection/fallback tests. Do not launch a new all-backend sustained matrix here.

Done: a frozen arbitrary-rack fixture runs through the real app and produces honest comparable metrics; default rollout is controlled.

### M1 — Add route selection and the CPU-prefix boundary

Scope: route policy, `pipeline.ts`, frame-result integration in `main.ts`, Node reference/route tests.

- Implement the static plan for the routes in section 3. New GPU routes remain disabled until their executors exist. Unknown configurations use reference CPU.
- Add the narrow CPU-prefix/remaining-tail boundary using the full compiled chain and existing filter instances. Test it with a JS tail first, so split execution must match existing unsplit JS.
- Return the exact audio/raw views and video modulation context needed by the tail; preserve original input for semantics and fallback.
- Centralize routing/presentation decisions in a small coordinator rather than adding another long conditional branch per filter in `main.ts`.
- Verify R0/R2/R3/R5, prefix-state continuity, tail failure without double DSP, and source-generation cancellation. Compare split/unsplit bytes, audio/raw monitors, RMS/peak and relevant node state across consecutive frames. Run focused Node tests and build. No performance campaign for this infrastructure-only milestone.

Done: route explanation and split execution are correct with unchanged JS behavior.

### M2 — Deliver the first usable multi-filter GPU tail

Scope: shared GPU video executor, Procamp prototype extraction, Solarizer/Colorizer kernels, app coordinator and one browser test group.

- Create one device/session and reusable packed-RGBA storage/presentation resources. Run Procamp, Solarizer and Colorizer in ordered passes. Each node preserves its own byte result before the next.
- Keep the standalone Procamp test adapter but make production encoding use the shared device/buffer. Provide diagnostic readback only for correctness tests.
- Implement R2 and R3 through CPU-prefix -> one RGBA upload -> GPU tail -> display. Audio/HUD stay from CPU prefix results. Verify R5 routes conservatively.
- Per-filter tests are short fixtures covering identity/extremes, alpha, rounding/LUT edges, repeated instances and changed parameters. One composed-rack test covers order and intermediate quantization. Use a short multi-frame sequence for lifecycle failures.
- Run one section-7 screen on R2 and R3. If promising, accept one representative winner now; defer final sustained confirmation until M6 if subsequent integration changes the same path. Preserve a working multi-filter integration before starting M3.

Done: the real application runs the three-filter GPU suffix, exposes audio/HUD correctly and recovers from a failed tail. Record whether it is a performance candidate or a non-winning experimental route. Kernel-only timing does not close M2.

If Procamp parity blocks this milestone after the diagnostic budget, retain the CPU Procamp prefix and deliver the exact Solarizer -> Colorizer GPU tail. Mark Procamp deferred and retain the full R2 preset for comparisons. This is a bounded fallback deliverable, not permission to remove filters from the measured preset.

### M3 — Remove CPU capture for eligible complete racks

Scope: `webgpu-tapesat.ts`, app GPU lifecycle/coordinator, shared video executor, compact monitor and resident fidelity tests.

- Reuse the existing gated capture and TapeSat scan. Expose a shared-device encode/finish boundary so the video suffix consumes reconstructed packed RGBA without mapping it to CPU.
- Support R3 with one TapeSat and the supported suffix. Support R2 with the implicit identity audio stage using the same stream LUT and monitor semantics. Do not fake a zero-effect TapeSat node.
- Gather playback/raw/post monitors at the correct audio boundary. Compute the reference audio-level selection before any audio-reactive video stage. Append any required fields to a versioned compact packet; one bounded map per frame remains the target.
- Preserve source-specific texture gating and exact-byte capture fallback. Record the fallback capture route separately; correctness does not imply its performance passes.
- Keep existing TapeSat-only behavior and state handoff. On unsupported order/format or failed fidelity use the eligible tail route only if its state handoff is valid, otherwise JS.
- Run the short resident-rack fidelity suite and screen against JS plus the M2 route. Only the winning route proceeds to acceptance. If resident work fails its budget, ship only a validated M2 winner and record M3 as deferred, without claiming the whole SPEC achieved its preferred route.

Done: an eligible multi-filter rack can stay GPU-resident through presentation, or has a documented failed/deferred outcome with the M2 route retained. A full acceptance run is required before promotion.

### M4 — Lock transitions, recording and fallback

Scope: coordinator/presentation transitions and existing app/export browser tests; no new backend or filter.

- Cover parameter/order/enabled changes, source replacement, unsupported formats, module/device failure, stop/dispose and no-WebGPU startup. Reuse focused existing cases rather than cloning the full suite per kernel.
- Cover transitions into snapshots/live recording and separate offline export, including first-frame freshness and live-history isolation. Keep export on JS; export acceleration and a complete codec research matrix are outside scope.
- Preserve existing state rules when a rack stops being eligible. No reset-on-route-change shortcut, duplicate audio or stale GPU canvas.
- Verify finite resource high-water marks and disposal with repeated route/source changes. Keep one frame in flight.

Done: the multi-filter route survives real app transitions; unsupported operations remain usable on the reference route.

### M5 — One optional measured CPU improvement

Run only after M2 delivers a working app route; do not let it delay release of a GPU winner. Default candidate: R4 scalar WASM arena. SIMD was not a demonstrated winner and is excluded from a new comparison unless scalar profiling establishes a concrete reason.

- Keep the complete compatible audio segment in the same runtime/arena. Preserve the reference 8192-sample chunk/filter order and output stores. No WASM call per sample and no full-stream copy per filter.
- Use existing TapeSat/Shiftr ports. Do not port Wavefolder, Moog or an entire family for this experiment. TapeWow's fixture randomness is ineligible for production.
- First characterize actual frame-boundary behavior: JS `TShiftRFilter.setParams` calls `init()` and `SonificationPipeline.syncChain` calls it each frame; the current WASM adapter behaves differently. Reset WASM Shiftr once per frame after applying parameters, including unchanged parameters, and preserve its state across chunks within that frame. Require multi-frame JS/WASM pipeline parity before timing. Skipping reference resets or changing the JS artwork is outside this SPEC. If parity cannot be established within the repair budget, defer M5.
- For a forced fresh-session benchmark, initialize JS and WASM from equivalent fresh state. Production switching requires explicit tested JS/WASM import/export for persistent state, including TapeSat in R4. Shiftr's previous-sample state is intra-frame under current reference semantics; switching is permitted only at a frame boundary. Without the required persistent-state migration, keep the experiment opt-in for fresh sessions and do not silently reset history on preset/route edits.
- Run one R4 screen and, if promising, one acceptance cohort. A faster result still above 25 ms is an incremental experimental result, not 720p30 acceptance.
- Stop after this candidate. If it loses, JS remains selected. If profiling instead selects a setup/cache fix, implement that single fix and document why it replaced R4.

Done: one accepted CPU improvement or one recorded no-go decision; no unresolved search across more ports.

### M6 — Acceptance and release handoff

- Run the consolidated automated gate once on the final candidate. Reuse `test:acceleration` after removing duplicated groups or run its affected groups once; document exact coverage. Apply the timeout rules below.
- Run the bounded acceptance cohort for at most two new winning route/workload combinations: normally R2 and R3. M5 may consume one additional cohort only if it won screening.
- Reuse the final R3 control for related valid comparisons; do not reuse a control across changed source/build/environment conditions. Run short R0/R1/R5 regressions and existing fallback tests; broad unchanged filters need no new sustained runs.
- Keep a single result table with actual route, p95, FPS, fidelity, transfer counts, device/build and decision. Include losing/unsupported outcomes. No new per-experiment narrative report hierarchy.
- Deliver a bounded route candidate. Before production deployment, verify the production bundle/HTTPS assets and fallback, physical audio/display, another named desktop and any intended phone/camera cohort. Missing devices leave deployment unverified; they do not trigger endless local reruns or prevent committing the completed implementation.

Done: evidence supports explicit accepted routes; the next executor can distinguish implemented, measured, release-ready and deployed. Deployment is a separate action.

## 7. Test budgets and acceptance gates

These are execution limits, not permission to bypass correctness. On expiry, retain the reference path, mark the candidate deferred/failed with evidence, and continue independent milestones. Never mark a timed-out required check as passing.

| Phase | Fixed work | Stop condition |
| --- | --- | --- |
| Edit verification | Affected Node/conformance checks and build; focused browser group after app/GPU integration | Repeat only following a relevant fix. No full campaign after each file/filter. |
| Fidelity | Small deterministic per-kernel fixtures plus composed rack/state/lifecycle cases | Fail immediately on mismatch. At most two substantive repair cycles per candidate before deferral. |
| Performance screen | One profiled diagnostic if needed; then AB/BA, 10 s warmup + 15 s measured per run, real app/audio/HUD | Screening chooses candidates only. An ambiguous result gets one acceptance cohort or is deferred; never many short reruns. |
| Performance acceptance | Three pairs in AB, BA, AB order, 10 s warmup + 60 s measured each; then one 300 s winner run | One cohort per final route/workload/build. A meaningful changed implementation permits one replacement cohort. |
| Harness failure | Preserve checkpoint and failure, correct the identified harness defect | One retry of the invalid run after a concrete fix. No simultaneous fallback runs or automatic repeat-until-green. |
| Final regression | One consolidated automated run; rerun only affected failed groups after fixes | A reproducible unrelated failure is reported separately; changed-path failures block that route. |

Use the existing test entry points. Add split/route cases to `tests/pipeline_reference.test.mjs` and a focused `tests/app_routes.test.mjs`; add composed app/GPU cases to `tests/browser/app-optimization.spec.ts`. The latter two paths are new deliverables, not currently existing test files.

```powershell
# M1 and later, after the new test file exists:
node --test tests/pipeline_reference.test.mjs tests/app_routes.test.mjs
npm run build

# M2-M4, after the new browser group exists; run GPU groups serially:
$env:BENCHMARK_GPU_BROWSER = 'chrome'
node node_modules/@playwright/test/cli.js test tests/browser/app-optimization.spec.ts --workers=1

# M5 only, when the WASM adapter or binary changes:
npm run test:wasm

# M6 once, with duplicate groups removed and external deadlines enforced:
npm run test:acceleration
```

After M0 implements the new options, a candidate screen uses the following form. Acceptance changes only `--phase screen` to `--phase accept`. Substitute the real frozen video path and hardware label; the command is an interface requirement, not a claim that these new flags work today.

```powershell
node scripts/benchmark-app-matrix.mjs --video "C:\fixtures\source-720p30.mp4" --preset tests/fixtures/app-optimization/R2.json --baseline cpu-reference --candidate cpu-gpu-video-tail --phase screen --headed --device-label "actual device" --output-dir docs/performance-results/app-optimization
```

Budget each route/workload performance investigation to 45 minutes wall time including browser startup and diagnostics; at most 30 minutes of unexplained failure/noise investigation within it. Across M2–M6, cap performance/harness investigation at 3 hours for this SPEC execution. Coding time is separate; this is not a promise that the entire implementation takes three hours. Record elapsed time and attempts in section 9. When a budget expires, no extra tests under a new label.

Give each browser correctness group a five-minute process deadline, each benchmark run its requested duration plus 120 seconds, and the final consolidated gate a 30-minute deadline. Ensure timed-out child/browser/server processes owned by the runner exit before another GPU run. Never kill unrelated browser sessions. Save partial evidence on timeout and stop the affected path.

Use production-equivalent settings: verified 720p30 source, identical preset, headed browser, HUD on, active audio at fixed volume, profiling off, existing validation on. Capture adapter/browser/power conditions and source/preset/build hashes. Benchmark code in a clean snapshot or record an immutable patch/asset fingerprint; a dirty diagnostic is never silently called clean. Physical listening/display checks remain separate from a running audio context.

Benefit gate for performance acceptance and CPU-only speed edits: median paired p95 improvement must be at least `max(2 ms, 10% of baseline p95)`, present in at least two of three pairs, with no pair worse by more than 5% p95 and no more than 2% relative throughput loss. These are practical selection thresholds, not statistical significance claims. Require preserved fidelity, no new audio/state/order errors and no growing queue/resources. Automatic GPU route availability follows the user's capability/composition policy; a route that has not passed this gate must be reported as unaccepted performance, even when it is selected automatically.

720p30 acceptance additionally requires frame-path p95 <=25 ms and processed FPS >=29.4 in all three candidate runs and each 60-second window of the five-minute confirmation. Keep application drops <=2% where separately measurable. Callback gaps are a proxy and must be labeled; they cannot close physical display/drop acceptance alone. At a 30-fps cap, evaluate p95/headroom rather than expecting FPS above 30.

Treat the relative benefit and absolute target as separate decisions. A route with byte fidelity, a passed benefit gate, and a clean 300-second confirmation is an **accepted performance route**, even if it misses 720p30. Record that the 720p30 target was missed; do not describe it as achieved. Only claim 720p30 acceptance when all absolute gates pass. Keep production deployment as a separate decision requiring device/build checks. Automatic route choice follows capability, rack composition, static constraints and fidelity fallback; it does not claim a performance win. Use `?gpu=js` to compare the complete CPU reference path.

## 8. Scope limits and next candidates

Core work is M0–M4 plus M6. M5 is optional. Existing TapeSat-only performance is a control; three GPU spatial filters and their reusable app path are the new deliverable. If a kernel cannot meet parity, deliver the safe supported subset and report reduced scope explicitly.

After a multi-filter spatial release is accepted, choose exactly one next milestone using real slow presets:

- Vidicon in the same GPU segment if temporal video matters: history migration, bypass/reorder, resize and memory are prerequisites. Do not inherit the prototype's two-slot queue automatically.
- CRT Bloom/ChromaSmear/CVI Slicer if spatial time dominates. Reuse the segment runner; add scratch buffers only where that algorithm requires them.
- One recurrent CPU algorithm if audio still dominates. Moog and TapeWow have no demonstrated general accelerator fix; algorithm changes require separate fidelity decisions.

FrameDelay, arbitrary GPU -> CPU -> GPU routing, dynamic cost learning, GPU TapeWow repair, workers, AudioWorklet changes, validation-off tuning, HUD quality reduction, adaptive resolution and all-filter ports are excluded. Preserve artistic output and user-selected quality.

## 9. Execution ledger and handoff

Update this table in place. Keep raw evidence under `docs/performance-results/app-optimization/` with one manifest per accepted cohort; do not create a new plan after every test.

| Milestone | Status | Commit / evidence | Performance minutes / repair cycles | Next action |
| --- | --- | --- | --- | --- |
| M0 controls and fixtures | VERIFIED | `app-benchmark-2b06412f-e97c-49bd-8489-0ef8617921ee.json`; `tests/fixtures/app-optimization/`; focused TapeSat tests + build passed | 0 / 0 | M1 routing and CPU prefix |
| M1 routing and CPU prefix | VERIFIED | `tests/app_routes.test.mjs`, `tests/pipeline_reference.test.mjs`, `tests/app_tapesat.test.mjs` (22 passed); `npm run build` passed | 0 / 0 | M2 GPU spatial tail |
| M2 GPU spatial tail | VERIFIED | Focused Node checks (23 passed); build passed; browser group (4 passed); final R2 screen `app-optimization-2026-10-14T072309-598Z-2c051ca8-screen-manifest.json`; R3 screen `app-optimization-2026-10-14T070718-580Z-199220af-screen-manifest.json`; incomplete final acceptance checkpoint `app-optimization-2026-10-14T072520-617Z-c19f2599-accept-incomplete-checkpoint.json` | ~25 / 3 parity repairs, 4 harness fixes | Keep explicit experimental route; M3 disposition |
| M3 resident multi-filter rack | ACCEPTED PERFORMANCE ROUTE (R3; 720p30 target not accepted) | `app-optimization-2026-10-14T084947-637Z-65641ad6-screen-manifest.json` (CPU vs resident; benefit passed); `app-optimization-2026-10-14T085446-027Z-7c792698-screen-manifest.json` (CPU vs M2 tail; benefit failed); `app-optimization-2026-10-14T085711-750Z-04b864cd-accept-manifest.json` (benefit passed, absolute gate failed); `app-benchmark-93561b8d-090f-4a1c-b173-6b466f4f1fdf.json` (299.97-second confirmation, fidelity passed, zero CPU raster readback); refreshed `app-resident-r3-fidelity-screen-precheck.json` (141 resident frames, 4.68 s measured, byte parity passed); resident app browser case passed in the final 6/6 group | ~15 performance minutes / one source-texture usage fix and one runner accounting fix | R3 local performance acceptance complete; keep auto-selection off pending production checks |
| M4 transitions and recording | VERIFIED | `tests/browser/app-optimization.spec.ts` (final focused group 6/6 passed, including sync-off, 480p, 16-bit, live recording, source replacement, snapshot and late-init cancellation); `npm run build` passed | 0 / 0 | M5 optional disposition, then M6 |
| M5 optional CPU candidate | DEFERRED, optional | No M2 route won its R3 benefit screen; R3 resident route is the measured winner; no WASM candidate change made | 0 / 0 | No extra WASM candidate in this execution; avoid widening scope |
| M6 acceptance and release handoff | ACCEPTED RELEASE CANDIDATE (R3 auto route; other devices assumed per user) | R3 acceptance cohort `app-optimization-2026-10-14T085711-750Z-04b864cd-accept-manifest.json`: paired benefit passed (-37.60 ms median p95 delta); all three candidate runs passed p95 <=25 ms and fidelity, but one was 29.19 fps (<29.4); two were 29.90 and 29.81 fps. Final focused browser group passed 7/7 in 1.1 minutes, including the new pre-submit reference snapshot regression; resident report recorded 141 frames over 4.68 s, parity and zero raster readback. The 299.97-second confirmation recorded 8,896 frames at 29.66 fps, p95 17.8 ms, p99 32 ms, one missed presented callback, fidelity passed and no runner problems. `tests/app_routes.test.mjs` passed 3/3; default-off and release-enabled builds passed. Visible release-enabled Chrome check selected R3 automatically at 720p and CPU at 480p, had no page errors, and user confirmed image/audio at both resolutions. This was route/output verification, not a performance run. Production preview record `production-preview-2026-10-14.json` retains prior HTTPS asset verification and both physical checks. Existing local gate remains `docs/performance-results/next-acceleration/automated-runs/2026-10-14T073407-044Z-6609222d.json` (12/12); prior R2 acceptance checkpoint remains incomplete | ~12 performance minutes / one route-aware harness correction and one browser-profile cleanup fix; 1 focused route-policy test group for release handoff | Target-desktop 720p/480p output confirmed. Cross-desktop and phone behavior are assumed per user direction and remain untested. At that checkpoint, the release flag stayed off; current policy selects eligible GPU routes by default in this worktree. Production deployment remains separate |

Allowed statuses: TODO, IN PROGRESS, IMPLEMENTED (verification pending), VERIFIED, ACCEPTED EXPERIMENTAL, ACCEPTED PERFORMANCE ROUTE, ACCEPTED RELEASE CANDIDATE, DEFERRED, FAILED. DEFERRED is a decision, not successful implementation. Track production rollout separately.

M0 evidence (historical): at that checkpoint, automatic TapeSat routing required `VITE_ACCELERATION_RELEASE_ENABLED=true`, which defaulted off in both Vite configs. That gate has since been removed per the current default-routing policy above. Explicit `?gpu=js`, `?gpu=wasm`, and `?gpu=tapesat` controls remain, with explicit GPU selection requiring WebGPU availability. The app benchmark accepts a frozen preset and route, inspects the report's actual route, and records preset/source hashes, build identity, route transitions and inclusive frame-path timing. The paired matrix supports bounded screen/accept AB/BA runs and no longer rejects slow routes by an FPS-derived minimum frame count. Frozen R2 and 720p30 source are under `tests/fixtures/app-optimization/`. The real-app CPU smoke processed 154 R2 frames in 5.124 s at 30.06 fps; frame-path p95 was 29.5 ms. This smoke is not a performance comparison and establishes no acceleration benefit. Active audio context and HUD were confirmed. Two harness defects were encountered (preset URL fragment placement and missing benchmark-config define); after both fixes the smoke passed. `app_tapesat.test.mjs`, both benchmark script syntax checks and `npm run build` passed. No deployment occurred. Next: M1.

M1 evidence: added a static route planner that identifies active nodes, CPU prefix, supported final-video suffix and explicit fallback reason. The application exposes the current route plan and actual route in benchmark reports while keeping unfinished routes on CPU reference. `SonificationPipeline.processPrefix` executes the existing full compiled chain up to its final video segment and returns the exact audio/raw views plus frozen video context; `processCpuTail` completes only that retained segment, with a frame token rejecting stale tails. Two consecutive split frames matched unsplit JS output and audio/raw samples, and route fixtures covered R0/R2/R3/R5 including mixed-order R5. Source-cancellation/backend-disposal tests passed with the focused TapeSat suite. No performance run was appropriate for this infrastructure milestone. Current route remains CPU reference (or the existing gated TapeSat override); next: M2.

M2 evidence: added a reusable WebGPU video-tail executor with packed RGBA storage, ordered Solarizer/Colorizer passes, GPU presentation and diagnostic-only readback. The GPU Procamp kernel passes deterministic per-filter fixtures, but application frames exposed rare one-byte differences from its audio-reactive f32 gain. The safe route therefore keeps Procamp in the CPU prefix for both R2 and R3 and uploads once for the exact Solarizer -> Colorizer GPU suffix. Colorizer uses a precomputed byte-exact blend table so its output matches JavaScript rounding. Audio and HUD stay on the CPU prefix. The four-test browser group verifies R2/R3 first-frame parity and app routing, plus route changes, recording, snapshot, source replacement, cancellation and readback-byte accounting; focused Node checks passed 23/23 and the production build passed. R2 final screen p95 improved by 8.9 and 9.1 ms, at 29.94–30.03 fps. R3 screen passed fidelity but missed the benefit gate (median p95 improvement 2.6 ms vs a 5.4 ms threshold) and stayed below 30 fps. The screen was collected on a dirty build while per-frame route eligibility diagnostics were present; that instrumentation has since been removed, so the screen is candidate-selection evidence only. A replacement R2 acceptance cohort began after the Procamp fallback changed the candidate, but run 5 exited with one browser console/page error; its incomplete checkpoint and five raw reports are preserved, and it was not retried. The earlier complete acceptance was for the superseded all-GPU-Procamp variant and does not qualify the current route. Thus the current R2 route is functionally verified and a screen candidate, not an accepted route. Automatic acceleration remains off by default; production rollout and physical audio/display checks did not occur. The paired harness defects and parity repairs are recorded in this ledger. Next: M3 is deferred; continue M4/M6 with the explicit experimental route only.

M3 disposition: R3 is the accepted performance route on the tested setup; it does not meet the separate 720p30 threshold. The explicit `gpu-resident-rack` path initializes TapeSat in texture mode, exposes its shared `GPUDevice`, imports the same 720p source on that device for Procamp -> Solarizer -> Colorizer, derives the reference-sampled same-frame audio levels from TapeSat's compact output, and retains a first-configuration byte comparison. A focused Chrome source-import test exposed the initial import failure: the video-tail texture lacked `RENDER_ATTACHMENT`, which Chrome requires for external-image copies. Adding that usage made source import and each composed filter stage byte-exact. The real R3 app then passed TapeSat and video-rack fidelity, selected the resident route and reported zero CPU raster readback for its measured frames. The first performance-screen attempt stopped because the matrix harness treated resident frames as JavaScript; its incomplete checkpoint and raw reports are preserved under `screen-incomplete-resident-harness/`. The route-aware accounting correction and one allowed retry completed the screen. On AMD GCN-5 / Headless Chrome 155, CPU vs resident produced a -37.90 ms median paired p95 delta and passed the screen benefit gate. CPU vs M2 tail produced only -4.50 ms and missed its 5.16 ms benefit threshold. The three-pair R3 acceptance cohort confirmed -37.60 ms median p95 improvement and byte fidelity, with candidate p95 values 17.1, 16.9 and 17.0 ms. Candidate throughput was 29.19, 29.90 and 29.81 fps; the first run missed the 29.4 fps 720p30 gate. The 299.97-second confirmation processed 8,896 frames at 29.66 fps with 17.8 ms frame-path p95, p99 32 ms, one missed presented callback, passed fidelity, zero CPU raster readback, active audio/HUD, and no runner problems; this confirms sustained local route stability; the dirty-worktree run does not establish physical audio/display behavior or cross-device support. Keep R3 as an explicit accepted performance route; automatic routing remains off pending production checks.

M4 evidence: the bounded browser suite confirmed fallback to CPU presentation when sync is disabled, resolution drops to 480p, format changes to 16-bit, or live recording begins; it confirmed return to the GPU tail after eligibility returns, source replacement and snapshot export. A delayed tail initialization was cancelled with its device disposed and stale frame rejected. Export continues through its independent CPU pipeline. Review found that source view did not hide the GPU-tail canvas; the CPU presentation reset is now included. The attempted direct source-view assertion was removed because this checkout's markup contains no `.vtab` source/developed controls. After removing that invalid assertion, the focused browser group passed 4/4. The source-view branch itself is not reachable through current markup and was not directly exercised. No physical display/audio or device-diversity gate was run.

M6 disposition: accepted as a local release candidate under the user-directed device assumptions; 720p30 acceptance and production rollout remain unachieved. The previous R2 cohort remains incomplete after the single permitted harness retry, as recorded above. For the winning R3 resident route, the acceptance cohort passed paired benefit and fidelity, while all p95 values passed and one candidate run measured 29.19 fps (<29.4); the other candidate runs measured 29.90 and 29.81 fps. `absoluteGatePassed` remains separate from relative benefit. The 299.97-second confirmation processed 8,896 frames at 29.66 fps, with 17.8 ms p95, p99 32 ms, one missed presented callback, passing fidelity and no runner problems. This does not waive or rewrite the separate 720p30 miss. The resident app browser case initially reached its report before the 10-second warmup elapsed after a route-settings reset; increasing its wait to 16 seconds fixed the measurement. The production preview first exposed a six-byte mismatch because diagnostic GPU readback preceded CPU reference capture; capturing the reference before GPU submission fixed it. The new ordering regression passed and the full focused browser group passed 7/7 in 1.1 minutes. The built bundle selected R3 at 720p and fell back to CPU at 480p, with no asset or browser errors; after the release-handoff policy change, `auto` selects only the exact eligible R3 resident rack when the release flag is enabled, while unsupported racks and ineligible dimensions stay on CPU; the longer physical check saw a 3-byte fidelity fallback at the transition. On the visible 720p run, the user confirmed image and audio both worked. A 30-second headless diagnostic held R3 with 16.5 ms p95 over 18 measured seconds. The user subsequently confirmed image and audio at the 480p CPU fallback during a visible Chrome recheck; the route showed JS/CPU and the page had no errors. See `production-preview-2026-10-14.json`. Route-planner tests passed 3/3, including release-enabled automatic selection of the exact R3 rack and fallback gates. `npm run build`, runner syntax checks and `git diff --check` passed. The production build passed and the built bundle served over local HTTPS with all hashed assets loading. A pre-fix R3 attempt correctly fell back after a six-byte parity mismatch; after fixing reference-frame timing, R3 activated at 720p and fell back at 480p. No phone/camera cohort ran; per user direction, phone behavior is assumed with CPU fallback as recovery, not verified evidence. A second desktop and phone are assumed to work per user direction, but neither was tested. Physical fallback confirmation is now complete; deployment and production runtime verification remain undone.

Production rollout status: **not deployed**. The prior release-enabled candidate and physical desktop checks are recorded above; they were produced under the former release-gated policy. The production bundle built and served over local HTTPS. On the visible target-desktop check, the user confirmed image and audio both worked with the R3 resident route at 720p; a headless 30-second diagnostic also kept R3 selected. At 480p the route switched to CPU; one visible run reported a 3-byte fidelity mismatch as the fallback reason. The user confirmed the image and audio both work at the 480p CPU fallback in a visible Chrome recheck; the browser showed the CPU route and no page errors. Asset loading and browser errors were clean. See `production-preview-2026-10-14.json`. The earlier sustained benefit remains measured on its recorded dirty build; no new sustained performance claim is made for the preflight timing fix. Current local policy automatically selects eligible GPU routes by rack composition; unsupported racks and ineligible formats, dimensions, camera sources, or missing executors remain on CPU. Cross-desktop and phone behavior were not tested. Short route checks add no performance result; the sustained R3 evidence remains the measured gain. Deployment and runtime production verification remain undone. Do not treat the earlier superseded all-GPU-Procamp acceptance as current release evidence.

For each completed/deferred milestone record: what changed; affected checks and outcomes; observed app benefit or why no performance test was appropriate; current route/fallback; remaining blocker; exact next milestone. If core multi-filter benefit is unproven, say so and stop expanding scope.

Suggested executor prompt:

> Implement docs/APP_OPTIMIZATION_SPEC.md sequentially, starting with the first unfinished milestone. Preserve the initial dirty worktree. Follow the fixed test budgets, retain correctness/state semantics and record evidence in section 9. Finish a usable application slice before starting another optimization. Do not rerun P00–P13, add workers, port every filter, or build a general backend planner. Stop each losing experiment at its defined limit and continue independent required work. Report implementation, measured benefit and rollout status separately.

## References

- [Latest local evidence](NEXT_ACCELERATION_TEST_REPORT.md) and [proposal decisions](performance-results/next-acceleration/FINAL_REPORT.md).
- [Spatial prototype decision](performance-results/next-acceleration/P07/DECISION.md), [CPU triage](performance-results/next-acceleration/CPU-baseline/DECISION.md), [Shiftr evidence](performance-results/next-acceleration/P09-DECISION.md).
- [GPUWeb Explainer](https://gpuweb.github.io/gpuweb/explainer/), consulted 2026-10-14: GPU-process separation and CPU/GPU ownership explain why kernel timing alone cannot decide an app route. The performance claims in this SPEC come from the local reports above.
