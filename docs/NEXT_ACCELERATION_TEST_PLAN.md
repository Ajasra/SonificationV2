# Next acceleration experiments and implementation plan

Date: 2026-10-13. Planning baseline: `d48b74099e3ce0b6f5c7e67006b57a22800966bc`, branch `codex/video-acceleration`.

Status: proposal queue, not completed experiments. This document continues [the original plan](PERFORMANCE_IMPLEMENTATION_PLAN.md); historical results stay intact. Execute one proposal at a time, record its verdict, then select the next eligible proposal. Passing an isolated kernel test never promotes an application backend.

An independent [planning review](NEXT_ACCELERATION_PLAN_REVIEW.md) checked the initial draft against the live code and primary sources. Its measurement, state-queue, filter-classification and planner corrections are incorporated below.

## Goal

Choose the best execution approach for each supported **ordered segment**, using measured full-application cost. Sustain 1280×720 at 30 fps on named desktop and phone devices while preserving image serialization, filter order/history, sound-camera sampling, audio-driven video, and export behavior. Reduce copies, hardware crossings, synchronization and long tails. Keep the existing JS reference and explicit backend override throughout.

A universal guarantee for arbitrary racks is outside this target. Reduced resolution, approximate effects, changed randomness and a new audio synthesis model require separate decisions. A worker, SIMD flag or texture import is a hypothesis to measure, not an automatic speedup.

## What we already know

| Evidence | Supported conclusion | Remaining limit |
|---|---|---|
| [WASM prototype](WASM_PROTOTYPE.md): synthetic JS/scalar/SIMD tape-pair p95 43.6/39.8/43.9 ms; Moog 108.4/117.2/110.8 ms | Existing ports pass implemented fixtures; these short measurements do not select a production winner | No matched sustained visible-app/phone comparison; fixture TapeWow randomness differs from production policy |
| [Five-minute GPU benchmark](performance-results/webgpu-prototype/USER-BYTE-FALLBACK-300-SECOND.md): 30.0006 fps, complete-path p95 20.7 ms | Supported TapeSat benchmark path can meet its implemented gates on that run | Live application audio/HUD and other devices are separate |
| [Latest preserved user app run](performance-results/webgpu-prototype/USER-APPLICATION-154B0141.md): 10.40 fps, frame p95 117.3 ms, capture p50 23.8 ms, completion/map p50 44 ms | Capture and completion/map intervals are material; mapped copying is small | Unnamed adapter and stale/dirty build provenance prevent causal comparison |
| [Fused dispatch A/B](performance-results/webgpu-prototype/FUSED-DISPATCH-2026-10-13.md): paired means 56.70 vs 55.69 fps; mean p95 16.95 vs 19.05 ms | Small local benefit; fused mode is already default inside the experimental backend | Headless AMD run, 60 fps clip, muted output and mostly HUD off; two pairs; combined GPU suite did not exit |
| Current app eligibility, `src/engine/backends/gpu-eligibility.ts:5` | GPU covers one TapeSat, 720p, 44.1 kHz, unsigned 8-bit interleaved RGB, no blend/equalize/video rack | A general segment planner and worker are still proposals |

The headless AMD results and earlier user results are different cohorts. Their large performance difference is unresolved; establish matched provenance before attributing it to a shader change.

## Data crossings to measure

Current CPU path:

`decoded source → canvas draw/read RGBA → color/stream encode → JS or copied WASM segment → stream/color decode → CPU output canvas`

Current experimental GPU byte path:

`decoded source → canvas draw/read RGBA → upload → GPU encode/TapeSat/render → compact map/readback → CPU audio + telemetry + state handoff`

Desired supported GPU segment:

`verified source import OR one exact-byte upload → GPU-resident ordered segment(s) + history + output → one bounded monitor packet`

Desired supported CPU segment:

`one RGBA capture → reusable JS/WASM arena → ordered CPU segment(s) → final output + bounded monitor packet`

For 720p, one RGBA frame is 3,686,400 bytes (3.52 MiB); one full RGB Float32 stream is 11,059,200 bytes (10.55 MiB). The current WASM segment copies that sample stream in and out: 22,118,400 logical bytes per segment/frame, about 633 MiB/s at 30 fps. The current GPU monitor packet is 32,776 bytes (8,194 floats), about 0.94 MiB/s at 30 fps. These are payload calculations, not measured bus bandwidth. GPU scans also copy/read/write large buffers internally; include those separately. Integrated/shared-memory hardware can still incur browser-process copies and synchronization.

Introduce a diagnostic transfer ledger: source/destination owner, representation, API-observed logical bytes/copies, upload/download span, explicit synchronization count, frame id and reason. Separate CPU↔WASM copies, main↔worker ownership transfers, CPU↔GPU crossings and modeled GPU-local traffic. Mark bytes as observed payloads or modeled lower bounds; hidden browser/driver copies and physical bus traffic remain unknown unless independently measured. Record application allocations separately. Optional GPU timestamps can locate kernel work; wall-clock completion/map includes additional scheduling costs and must not be labeled pure GPU execution.

## Proposal queue

Each row has a control, a specific experiment and a route into the app. Run variants within a row serially. New filter ports run individually first, then as a contiguous rack; never port a whole category before its first candidate proves useful.

| ID / proposal | Test and benchmark | Decision and application |
|---|---|---|
| **P00 — Reproducible baselines and attribution** | Preserve current JS, scalar/SIMD WASM and experimental GPU reports. Fix fresh-build/source/preset identity, name hardware manually if API identity is blank, align stage samples with measured windows, add transfer/resource/queue accounting. Resolve the combined GPU runner hang. Benchmark visible app with actual 30 fps source, audio audible and HUD on; use headless runs only as a separate diagnostic cohort. | Exit when repeatable controls and report ownership are established. Diagnose the user/headless discrepancy before claiming recovery. Do not wait for every new backend before beginning the queue. |
| **P01 — Capture and upload** | Compare existing `willReadFrequently` byte capture against fresh CPU/GPU-backed capture surfaces, the existing exact texture mode, and owned ImageBitmap/VideoFrame import where supported. Measure draw/read, snapshot/import, upload and full path independently. Compare the same frozen decoded frame; then multiple frames, edges, colors, alpha, resize/flip and camera. | Select texture input only for a tested source/format/device path that passes the existing byte-exact gate. Retain reference-byte capture after any mismatch. Promote faster byte capture independently even if texture mode fails. Never claim zero-copy from an API name. |
| **P02 — Finish the dispatch experiment** | Existing fused-on vs `gpu-fused-apply=off`, counterbalanced visible-browser runs. Compare validation on/off as its own experiment; keep validation on for other comparisons. Check samples, rendered pixels, recurrence state, GPU→JS continuation and suite cleanup. | Retain fused mode where the small repeatable gain survives full-app checks. Retain the control override. Current validation-off evidence shows no benefit; do not disable it without new evidence. This row verifies existing work before another scan rewrite. |
| **P03 — Bounded monitoring and HUD work** | Current 8,194-float GPU packet vs demand-driven gathers: playback 4,096 values, filtered prefix 2,048, raw prefix 2,048, state 2. Compare all consumers on/off, HUD draw cadence and telemetry update cost. Freeze exact sound-camera stride, HUD indices and first-512 DOM meter behavior. Measure audible audio plus input responsiveness. | Omit only data with no active consumer; always preserve required state and any audio-driven video levels. Keep default HUD/audio enabled in acceptance. Lower HUD cadence is an explicit measured UI policy, not silent removal. Extend the same owned packet contract to JS/WASM/worker. |
| **P04 — Ordered readback ring** | Control: one frame awaits compact map before the next frame. Candidate: two independently owned readback/render slots, GPU state advanced in submission order; overlap CPU readback with following GPU work. Start with two slots only. Test delayed/reordered completion, state continuation, source/preset changes, device loss and shutdown. Measure throughput, p95/p99, capture-to-commit age, audio order/skew and allocation. | Keep only if gains exceed added latency and memory. Commit image/audio/state in sequence and discard stale generations. Bound to two submitted frames plus one replaceable unsubmitted source frame. No concurrent mutation of pooled resources. No extra latency above one 30 fps frame (33.3 ms) relative to control. Revert to serialized mode if fidelity/order fails. |
| **P05 — Reduce CPU/WASM copies** | Control: `WasmDspRuntime.processSegment` copies full samples each way. Candidate: serialize directly into preallocated WASM memory; process the entire compatible segment; deserialize/read monitor values from that arena. Compare JS↔WASM crossings, stream/color transforms and chunk sizes while preserving existing Float32 stores and chunk/filter order. Test bounds, borrowed/owned views, disposal and buffer reuse. | Keep a whole CPU segment resident in one arena if its complete browser path improves. No JS→WASM call per filter/sample. The current fixed 64 MiB module memory makes views stable; any proposed growth needs new invalidation tests. Include capture/presentation costs when judging the winner. |
| **P06 — Pointwise audio and conversion kernels** | First compare Amplify alone, then Amplify→Shiftr→Wavefolder on JS, scalar, explicit SIMD and GPU. Add Sigmoid/Vacuum individually if profiling warrants it. Compare fused stream encoding, pointwise arithmetic and reconstruction while retaining each filter's Float32 store/quantization/clipping boundary. Measure isolated CPU-origin and already-GPU-resident racks. | GPU wins may apply only inside an existing resident segment. WASM SIMD may win CPU segments. Keep cheap isolated nodes on JS when startup/crossings consume the gain. Bitcrusher/SR Reducer have held-sample/counter state and need a separate phase-preserving experiment. Divider's zero-crossing history and RandMix's recurrence exclude both from the stateless group. |
| **P07 — Spatial video kernels** | Port Procamp first, then Solarizer and Colorizer individually and as a resident rack. Follow with Differentiator/CVI Slicer using immutable input neighbors and exact row edges; then CRT Bloom's highlight buffer and ChromaSmear's separate intermediate data. Compare JS vs GPU; add WASM only where CPU profiles justify a port. Include audio-reactive parameters and clipping after every node. | Keep texture/buffer intermediates on GPU through consecutive compatible video and DSP stages. Prove row boundary/indexing behavior before fusing passes. A faster kernel that needs full-frame readback between nodes is not a winning segment. |
| **P08 — Temporal video on GPU** | Vidicon first: per-pixel Float32 trail history. FrameDelay second: 16-frame RGBA ring, blended-output storage, freeze/stutter/write-index behavior. Compare multiple frames and sequences exceeding 16 frames; parameter/bypass/reorder/source/resize, audio-triggered state and sustained memory. | GPU history remains resident for compatible segments. FrameDelay's 16-frame storage alone is 56.25 MiB at 720p; cap and report actual total resources, including work/render slots. Keep CPU fallback if phone memory or transfer costs outweigh benefit. Never replace Feedback's same-frame recurrence with ordinary previous-frame ping-pong. |
| **P09 — Selective recurrent CPU optimization** | Re-run TapeSat/TapeWow/Moog with the P05 arena. Profile the exact CPU bottleneck, then take one representative at a time from EQ/biquads, dynamics/envelope and delay/feedback families. Compare JS, scalar and SIMD independently; test rates, block split boundaries, parameters and long state drift. Use Moog as the difficult control. | Choose per-segment measured winner. CPU-first candidates include Moog/VCF303, feedback delays, envelope-dependent dynamics and phasers. Reassociation, reduced precision, LUT replacements and fast math are separate fidelity candidates. Do not continue porting a family after its representative has no measurable benefit. |
| **P10 — GPU TapeWow and complete tape segment** | Model input-ring delay reads and oscillator/control trajectory explicitly; fixture uses the existing specified random stream and processing clock. Compare TapeWow alone and TapeSat→TapeWow vs JS and both WASM variants. Test ring wrap, block/frame continuity, state handoff and long modulation drift. Then specify/test compatible production random-control ownership without silently replacing Math.random. | Promote only the whole supported tape segment with state/control fidelity and full-app advantage. Controlled seeded conformance alone is insufficient for production randomness. GPU Moog remains deferred; nonlinear feedback is a distinct algorithm problem. |
| **P11 — Segment planner and shared backend interface** | Feed measured segment and transfer costs into plans for pure CPU, pure GPU and audio→video→audio / video→audio→video racks. Compare planned routes against forced JS, WASM, GPU and deliberately fragmented routes. Cover unsupported formats, global blend/equalize, audio-reactive video and state migration. | Pick routes by total frame cost including encode/decode, crossings, sync and startup amortization. Preserve rack order and observable conversion boundaries. Use a conservative static capability/cost table first; per-session measured selection later. A slower/unsupported hybrid must choose the reference route. |
| **P12 — Worker and bounded frame scheduler** | Compare the winning CPU/GPU route on main thread vs one persistent worker using transferred owned frames/buffers and OffscreenCanvas where tested. Measure control-event response, long tasks, transfers and end-to-end frame age. Exercise late replies, source replacement, hide/resume, repeated start/stop and camera ownership. | Adopt a worker for measured responsiveness or throughput benefit. One executing + one replaceable pending frame for the serialized mode; P04's two-slot mode has its separately tested bound. Close every discarded source frame. Processing time remains the effect clock; media time remains identity. Worker use does not imply faster DSP. |
| **P13 — Export, sustained devices and rollout** | Freeze supported presets and named desktop/Android/iPhone entries. Run 300-second app sessions, camera/file separately, 20 lifecycle cycles and recording/export tests. Compare JS exports for pixels, sample indexing, timestamps, abort and live-history isolation. Check HTTPS, worker/WASM assets, cache versions and fallback serving. | Enable winners only for the passed capability/device/preset matrix. Export stays on its verified reference route until its own acceleration gates pass. Explicit override and last-known-safe route remain available. A failed physical device is a documented unsupported entry, not hidden by desktop results. |

Default order: P00 → P01 → P02 → P03 → P04 → P05 → P06 → P07 → P08 → P09 → P10 → P11 → P12 → P13. After P01–P03, use attribution to defer P04 if map/synchronization is no longer material. Complete a verdict before changing the next variable. P11's minimal contracts and capability table can be specified early; automatic selection follows measured candidates. Stop unproductive branches rather than implementing every proposal regardless of results.

## Filter placement hypotheses

These are test priorities, not a completed capability registry. P00 must inventory every filter id with its actual state/read/write dependencies before general routing. Shader availability alone never marks a filter accepted.

| Behavior / modules | Initial approach | Constraint |
|---|---|---|
| Stream packing/unpacking, color transforms, blend; histogram equalization separately | GPU within resident routes; JS/WASM for CPU routes | Preserve bit depth/sign/layout/law/endian/traversal, integer rounding and global placement; histogram needs reduction/prefix work |
| Amplify, Shiftr, Wavefolder, Sigmoid, Vacuum | JS vs SIMD vs GPU pointwise experiment | Preserve intermediate Float32 stores and clipping; runtime randomization supplies fixed params |
| Bitcrusher, SR Reducer | CPU first; indexed GPU candidate later | Phase, held sample and frame/block counters are state, even though arithmetic is simple |
| TapeSat | Existing GPU vs CPU; close app/device gates | Two recurrences and f32 state handoff require existing tolerances |
| TapeWow, input-history modulation/gathers | CPU first; P10 GPU candidate | Delay/phase/control history and production random draw ownership |
| EQ, Moog/VCF303, envelopes/dynamics, feedback delays, phasers, RandMix, Divider | Profile JS/WASM; selective CPU ports | Many dependencies are within a sample sequence; Divider carries zero-crossing/amplitude state; linear affine scans apply only after algebra/state proof |
| Procamp, Solarizer, Colorizer | GPU pointwise first | Same-frame audio modulation and byte quantization |
| Differentiator, CVI Slicer, CRT Bloom, ChromaSmear | GPU immutable-neighbor/staged algorithms | Exact row edges, neighbor source and intermediate precision |
| Vidicon, FrameDelay | GPU per-pixel history / frame ring | State continuity and mobile resource budget |
| Feedback, RF Tuner | Reference/CPU until dedicated proof | Feedback updates the same history it samples; RF Tuner reads previously modified row pixels and advances PRNG |
| Ruttetra, Scanimate | Reference/CPU until ordered scatter design | Colliding writes must reproduce the reference winner/order |
| SyncGlitch; remaining oscillator/random/synthesis filters | Inventory/profile first | Clock, PRNG draw order, phase and history are filter-specific; category labels cannot prove parallelism |

## A repeatable experiment cycle

1. **Freeze the question.** Record proposal id, hypothesis, baseline/candidate revision, one changed variable, source hash/cadence, preset hash/full params, hardware/browser/power conditions, backend support, capture mode and expected failure behavior. Predeclare sample/pixel/state tolerances and resource limits.
2. **Correctness before timing.** Apply existing scalar/SIMD/GPU bounds unchanged. WASM fixtures require max sample error ≤1e-6, RMS ≤1e-7, double-state error ≤1e-9, exact ring history and reconstructed pixels. Existing TapeSat GPU fixtures require max sample error ≤1e-4, RMS ≤1e-5, exact captured input and existing resident rendered-pixel bound of one byte level. New ports need their own declared bounds before implementation; byte-preserving capture/format round trips remain exact. Cover impulses, extrema, gradients, odd sizes, 8191/8192/8193 blocks, repeated frames, long histories, parameter edits/bypass/reorder/reset, mixed chains and unsupported configurations. Random/time fixtures use the same recorded control sequence and clock.
3. **Locate the cost.** Run profiled diagnostics with stage spans and transfer ledger. Label optional GPU timestamps separately. Capture/map/validation/HUD work can overlap: never sum their percentiles. Resolve missing provenance or sample-window alignment before comparing.
4. **Matched performance.** Separate unprofiled throughput comparisons from profiled attribution. Warm up 10 seconds, measure 60 seconds per run; three matched baseline/candidate pairs in alternating AB/BA order on the same device. Use the visible app with HUD enabled and audible audio for the primary cohort. Consumer-off, headless and 60 fps stress runs are separate cohorts. Alternate/cool down consistently on phones and record thermal/power conditions.
5. **Sustained confirmation.** For winners, run 300 measured seconds and inspect each 60-second window. Use identical named presets/settings for reference and candidate. Record frame path p50/p95/p99, measured-wall-clock FPS, source cadence/callback gaps, frame age, event response, audio order/skew, long tasks, bytes/copies/syncs and resource counts. A manual listening/display check complements instrumentation; callbacks are not physical display proof.
6. **Verdict.** `keep`, `conditional`, `reject`, or `inconclusive`. Keep requires fidelity/lifecycle/resource gates plus repeatable full-path or declared responsiveness benefit. As a proposed worthwhile-effect threshold, target ≥10% improvement in p95 or ≥2 ms reduction, or closing a failed 30 fps gate; low-complexity changes with smaller consistent wins may be retained with the exception documented. A kernel-only win is conditional; a within-noise/confounded result is inconclusive. Never classify hardware absence as an algorithm failure.
7. **Apply one slice.** Integrate only the proved capability; verify fallback and relevant app/export checks, update progress/decision record, and make an atomic commit before the next implementation slice. Preserve all raw reports, including failures and warmup/reset history. Re-benchmark the integrated route: isolated wins can disappear at the app boundary.

### Acceptance

Retain the existing 720p30 gates: frame-path p95 ≤25 ms; processed FPS ≥29.4 with a verified 30 fps source; application drops ≤2% where separately measurable. Current `missedPresentedCallbacks` is a proxy mixing source/decoder/app omissions; ≤2% proxy can be an additional conservative guard but does not close the application-drop gate without attribution. No backlog, stale output, reordered sound/state or monotonic resource growth.

A 60 fps stress source is useful but has its own denominator. It cannot be evaluated as if its callback stream were 30 fps. Five-minute aggregate success does not hide failing one-minute windows. Preserve total session context and reset reasons; compare only matching stable settings windows, never average different presets/mute/HUD configurations together. P04 additionally caps extra capture-to-commit age at one 30 fps frame. P12 proposes p95 control-event response ≤100 ms and no regression in frame/audio gates; validate that budget against P00's baseline before adoption.

## Unified implementation contract

Build around `resolveChain` and the current pipeline's ordered audio/video segments; keep `SonificationPipeline.processFrame` as the reference/export entry. New paths below are proposed, not existing files:

- `src/engine/backends/capabilities.ts`: filter/format/parameter/rate/size coverage, fidelity mode (`byte-exact` or `bounded`), tolerance/fixture revision identities, separately validated state-migration support, state version, memory requirements, clock/random policy and fallback reason.
- `src/engine/processing-session.ts`: initialize, submit, update parameters, reset(reason), dispose; owns generation/sequence, queue limit, resource leases and authoritative node history.
- `src/engine/segment-planner.ts`: chooses legal ordered routes with measured compute + encode/decode + transfer + synchronization + gather/render costs, plus migration/startup costs amortized over an explicit session estimate. Whole-JS and whole-supported-CPU/GPU routes are controls. Hysteresis prevents per-frame switching; replan on structural/capability change, not noisy instantaneous timings.
- Backend result: `{ generation, sequence, mediaTimeUs, processingTimeMs, presentationHandle, monitorPacket, stateCheckpoint?, timings, transfers, failure? }`. Media identity and processing-start effect clock are distinct. Use owned packets or explicit resource leases; current pipeline views are borrowed and cannot be transferred while reused.
- Monitor packet: 4,096 playback samples at the reference indices, consumer-required prefix/raw/HUD data, exact reference RMS/peak sampling when needed, original stream length and frame identity. CPU sound-camera receives already gathered samples with stride one. For other formats/resolutions, derive HUD selection explicitly rather than assuming the current TapeSat mapping generalizes.
- State belongs to the executing session/backend. Seed once on supported migration, not every GPU frame after introducing queued execution. Ordered GPU work advances state for every processed frame. CPU checkpoints/presentation/audio commit use matching identities. Unsupported migration drains and explicitly resets with a report reason; no claim of seamless continuity. Source/preset changes invalidate generations and prevent stale publication.
- Preserve reference conversions at every audio/video boundary, original image for blend, equalization at the final audio segment, raw preview before the first audio segment, and same-frame/previous-frame audio level behavior. Physical residency can cross a semantic boundary; observable byte/sample rounding cannot be removed casually. Dropping happens before submission and advances DSP only for processed frames.
- Device/worker loss enters a documented failure state, releases resources and restarts a supported reference session with tested checkpoint or explicit reset. Live and export history are separate. Renderer ownership is chosen before context acquisition or uses the existing separate GPU canvas.

Do not introduce SharedArrayBuffer/WASM threads or deployment isolation headers in this queue. If measured worker transfers remain dominant after P12, define a separate shared-memory proposal with its own serving requirements.

P04's slot state machine is `{ generation, sequence, status: submitted | ready | committed | discarded }`. Only the unsubmitted pending source frame can be replaced. Submitted stateful frames advance GPU history in order; current-generation results commit in order even if map promises settle differently. Old-generation results become discarded without publishing image/audio/CPU checkpoints. Keep their resources alive through completion, then dispose. Before resetting/reseeding a reused runtime, drain its outstanding queue and mappings; alternatively retire that runtime and initialize an independent resource set. Render into owned slot textures and present only on ordered commit, rather than writing a visible canvas before stale-generation checks. A map/validation failure retires the affected session; its already-mutated state is not represented as a successful CPU checkpoint.

P11 starts with at most three legal route classes: all-JS, all-supported-WASM, and one contiguous GPU island with necessary CPU prefix/suffix. Do not enumerate arbitrary per-node backend combinations. Store cost records keyed by revision, device/browser, source type, dimensions, formats, full rack/parameters, capture mode and consumers; require at least three matched pairs and preserve pair dispersion. Use measured whole-route costs as the verdict; stage estimates only propose routes. Invalidate costs after relevant changes; do not extrapolate headless/device costs into visible-app selection. If evidence is absent or does not separate candidates from observed variation, use the static supported control/forced override. Report cold startup separately from warmed steady state. Startup amortization requires a recorded caller-supplied session horizon; with no horizon, do not select a speculative amortized route. Later calibration remains an opt-in test mode until state migration and calibration overhead are validated.

P03 introduces a named monitor-index conformance fixture. Let `n` be the last audio segment's full sample length and `s = max(1, floor(n/4096))`:

| Consumer | Reference selection to preserve |
|---|---|
| Audible playback | Value `i` is `stream[i*s] || 0`, for `i=0..4095`; already gathered playback enters the audio player at stride one |
| Post HUD scope | Original full-stream 256-point selection `stream[i*max(1,floor(n/256))]`; the current 720p GPU packet reproduces it through playback indices `i*16` |
| Raw preview / raw scope | First `min(n,2048)` values before the first DSP segment; existing scope downsamples that prefix with `max(1,floor(prefixLength/256))` |
| DOM meter | Original first `min(n,512)` filtered samples, supplied within the filtered prefix; preserve its existing RMS/peak calculation |
| Audio-driven video | Pipeline sampling at `max(1,floor(n/1024))` after each required audio segment, preserving count and prior-frame fallback behavior |
| TapeSat handoff | Packet floats 8192/8193 are final bump/tone state for the same committed frame |

Playback and scope indices do not necessarily nest at other stream lengths. A general packet may need a separately gathered scope trace; never derive it from a convenient prefix without testing the reference indices.

## Evidence storage and commands

Store new immutable reports in `docs/performance-results/next-acceleration/Pxx/<run-id>.json` with a manifest identifying paired runs. Each proposal gets a `DECISION.md`: hypothesis, fixtures/tolerances, exact revisions/commands, hardware/source/preset, correctness outcome, paired full-path result, limitations, verdict, supported integration scope and rollback. Result files and decision documents are created when experiments run; this plan does not manufacture pending results.

Existing commands to reuse:

```text
npm test
npm run test:wasm
npm run test:gpu
npm run test:browser
npm run build
npm run build:benchmark
npm run benchmark:wasm
node scripts/benchmark-app-gpu.mjs --headed --duration 60 --profile off --audio active --volume 0.25 --hud on --gpu-fused-apply on --gpu-validation on --source-fps 30 --device-label "<recorded device>" --output-dir docs/performance-results/next-acceleration/P02
```

The app-GPU runner currently defaults to the local 60 fps stress clip, zero output volume and forced `gpu-profile=1`. P00 must add explicit source/active-audio/profiling controls and general JS/WASM app comparison before treating the last command as primary acceptance. Supply `--video <verified-30fps-clip>` when available; record actual decoded cadence. `benchmark:wasm` is synthetic exploration, not sustained application acceptance. Broaden tests only when the proposal changes the relevant boundary. No physical benchmark or new implementation test was run to create this planning document.

## Primary technical references

Consulted 2026-10-13:

- [WebGPU Explainer, 8 October 2026](https://gpuweb.github.io/gpuweb/explainer/): browser GPU-process/memory visibility and mapping ownership explain why buffer payload size alone does not predict map latency. Measure synchronization even on integrated hardware.
- [WebCodecs specification](https://www.w3.org/TR/webcodecs/#memory-model): raw media references can be transferred between realms without copying the underlying resource; close released/discarded frames. This does not prove that capture/import into GPU or canvas is zero-copy.
- [Emscripten SIMD documentation](https://emscripten.org/docs/porting/simd.html): SIMD semantics and unsupported host instructions can affect performance. Pin the existing toolchain and measure explicit vector kernels separately from flag-enabled recurrent ports.

## Immediate implementation slice

Start P00: recover/preserve the fused A/B raw Downloads reports into the repository with hashes, reproduce and fix the combined GPU suite shutdown, refresh source/build/device identity, align timing cohorts, and expose equal JS/GPU/WASM application controls with explicit active-audio/volume, source cadence, HUD and profiling settings plus observable transfer accounting. The GPU runner now accepts profile/audio/volume/source-rate/device-label options and embeds those declarations in its report. PowerShell's `npm run` path stripped its option names in an attempted run; use `node scripts/benchmark-app-gpu.mjs --duration ...` until the invocation issue has a verified fix. That 60-second default run is preserved as a diagnostic, with unknown cadence/device and pre-harness-revision metadata. Freeze an empty rack, TapeSat, TapeWow, tape pair and Moog baseline. Then test P01; use that evidence to choose whether capture, readback or CPU arena work comes next.
