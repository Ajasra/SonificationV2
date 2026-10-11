# Review of the acceleration proposal

Date: 2026-10-11. Companion implementation contract: [PERFORMANCE_IMPLEMENTATION_PLAN.md](PERFORMANCE_IMPLEMENTATION_PLAN.md).

## Frozen proposal under review

My proposed next step is a small comparative prototype that answers the expensive questions before a full rewrite:

1. Compile TapeSat + TapeWow into one WASM module, preserving full resolution, state, and the existing numeric model. Compare scalar and SIMD builds against the current JS path.
2. Implement a GPU version of the same pair: independent saturation and delay sampling, with parallel scans for TapeSat smoothing and a separate modulation/control pass for TapeWow.
3. Compile Moog Ladder to WASM as the difficult case. This tells us how much improvement compilation alone provides for a strongly sequential filter.
4. Measure complete browser paths at 720p, including transfers and display, and compare resulting images and retained state across multiple frames.

If those results are good, we build a planner with WASM for difficult recurrences and WebGPU for compatible segments. We can later investigate CPU pipeline parallelism across filter stages, preserving chunk order; WASM threads require shared memory and the appropriate deployment headers.

I would start with full-resolution WASM for the two tape filters and Moog, alongside a focused GPU prototype. That gives us evidence about both routes without prematurely changing the image-to-audio mapping. A claim of 720p at 30–60 fps should then apply to a defined set of supported presets and devices; an arbitrarily long rack will always need some limit or an optional quality tradeoff.

## Review findings

Altitude: fog at integration and acceptance boundaries. The proposed comparative prototype is appropriately scoped, but alone does not define deployable interfaces, resource ownership or measurable completion.

- Major: fix/reference-test mutable chain invalidation before comparing ports (`src/engine/pipeline.ts:82`); a backend must not inherit an untested bypass contract.
- Major: SIMD and GPU do not guarantee the same numeric model. WGSL has no native f64; preserve double precision for initial WASM and independently gate GPU fidelity ([WGSL](https://gpuweb.github.io/gpuweb/wgsl/), consulted 2026-10-11).
- Major: real-browser integration is missing from the current Node/VM test harness (`package.json:8`, `tests/regression.test.mjs:10`). Add browser tests and physical device acceptance.
- Major: canvas ownership and backend recovery need explicit design. Existing startup obtains a 2D context (`src/main.ts:40`); canvas transfer after context acquisition fails ([transferControlToOffscreen](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen), consulted 2026-10-11).

What holds: full-resolution comparison, retaining difficult recurrences on CPU, testing both tape filters as a segment, and requiring browser-wide measurements rather than kernel speed alone.

## Independent review of the detailed draft

An isolated reviewer identified three additional major gaps, now addressed in the companion plan:

- Deterministic TapeWow control: private random-target/count state and sample-loop Math.random prevent repeatable cross-backend comparison (`src/engine/filters/lofi/tapewow.ts:17`, `:85`). Add a specified test PRNG, draw order and serialized control state; retain stochastic production presets on JS until their policy is implemented.
- Clock semantics: source media time differs from the current processing-start filter clock (`src/engine/pipeline.ts:187`, `:208`). Make processing time explicit and test worker delay/drop behavior rather than substituting source timestamps.
- Monitoring ABI: current playback selects 4096 samples from the full stream (`src/audio/sound-camera.ts:99`) and main.ts forwards full arrays to HUD (`src/main.ts:981`). Specify bounded owned playback/preview/HUD payloads with exact reference indexing and prevent a second downsampling step.

## Promotion delta

The companion plan adds a reference gate, reproducible toolchain setup, worker/session ownership and failure contracts, format-specific capabilities, separate export state, explicit throughput/latency budgets, device/resource tests, and rollback. The initial targets were desktop 720p60 and phone 720p30. On 2026-10-11 the user revised the target to 720p30 on all devices; named hardware and supported preset acceptance remain open. The frozen proposal above is retained as historical review input.

This review records the proposal before implementation. Current implementation status and verification are tracked in [PERFORMANCE_PROGRESS.md](PERFORMANCE_PROGRESS.md); no physical performance acceptance is claimed.
