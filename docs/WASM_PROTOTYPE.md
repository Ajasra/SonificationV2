# WASM DSP prototype

Updated 2026-10-11. Experimental benchmark backend; the application still defaults to JavaScript. This is a measured compiler comparison, not a 720p30 acceptance claim.

## Implemented boundary

- C++ ports of TapeSat, TapeWow and Moog with double intermediates/history and Float32 sample stores. TapeWow retains Float32 input-ring storage and receives the exact JavaScript sine table.
- Pinned Emscripten 6.0.12 and emsdk commit in `native/dsp/toolchain.json`.
- Separate scalar and SIMD-enabled builds. Both use O3, disable fast math and floating-point contraction; scalar additionally disables vectorization. SIMD compiler flags do not establish vectorization of a recurrent loop or a speedup.
- Versioned ABI, persistent filter handles, reused memory, parameter updates only when values change, owned state snapshots and explicit disposal. Each module reserves a fixed 64 MiB WebAssembly memory; sample buffers reuse capacity and avoid growth/view invalidation.
- A whole audio segment crosses the JS/WASM boundary once in each direction. Native execution preserves the reference's chunk-outer/filter-inner order and Float32 stores between filters. A single-filter segment retains its existing whole-block execution.
- The benchmark offers individual TapeSat/TapeWow cases, their combined segment, and Moog across JS, scalar WASM and SIMD WASM. Reports include build flags/compiler/source/artifact hashes.

Production TapeWow still defaults to Math.random. Only conformance and benchmark sessions use xorshift32 with seed 4821 in both backends. Constructor/init consume no random draws; randomize consumes three; processing draws a new drift target when the decremented counter reaches zero. Reset clears filter history without resetting the external fixture random stream. The seed/state, draw order and noise counter are compared in tests. This does not authorize deploying a new random policy to the artwork.

## Fidelity gates

Bounds were declared before accepting the ports: maximum sample error ≤1e-6, sample RMS error ≤1e-7 and retained double-state error ≤1e-9. Ring history requires equality. Browser fixtures require exact reconstructed RGBA bytes.

Tests cover scalar rates 8000/44100/48000/96000, empty and odd blocks, lengths around 8192, long blocks crossing random-target updates, reset/parameter changes, invalid ownership and disposal. A three-frame 720p sample-stream sequence checks the complete scalar tape segment; the SIMD candidate has its own rate/state and full-segment checks. Chromium compares both backends with JS across eight successive image frames for the individual filters and tape pair.

Passing these fixtures does not establish equivalence for every parameter/stream/color combination or safe production state migration. Rate support in the native prototype is bounded to 8000–192000 Hz. Unsupported filters fail explicitly; the production planner and mixed-backend fallback are not implemented here.

Verified this slice: `npm test` (50 passed), `npm run test:wasm` (9 dedicated conformance tests passed), `npm run test:browser` (3 Chromium tests passed), scalar/SIMD compilation, both application/benchmark builds and `git diff --check`. Browser tests also exercise failed WASM loading and recovery of the benchmark controls. No physical phone or production serving check was performed.

## Build and use

The small prebuilt modules and matching metadata are included under `public/wasm/`. Running the benchmark does not require a local compiler.

```text
npm ci
npm run dev:benchmark
```

Open `http://127.0.0.1:5175/benchmark.html`, select the same local 720p30 video, preset and duration, then compare backend choices. Use 60-second measurements and 300-second sustained runs. Compare unprofiled runs for throughput and profiled runs for attribution. New TapeWow reports use fixture randomness; retain the older production-randomness reports as historical references.

For rebuilding the ports:

```text
npm run setup:wasm
npm run build:wasm
npm run test:wasm
```

Setup uses Python (`py` on Windows, `python3` elsewhere), Git and the pinned SDK. The SDK downloads several hundred MiB into ignored `.tools/emsdk`. `EMSDK` and `EMSDK_PYTHON` may override locations. No permanent PATH or deployment-header changes are required. Build metadata and WASM/source hashes are checked by tests; browser loading rejects artifact/metadata mismatches.

Other checks:

```text
npm test
npm run test:browser
npm run build
npm run build:benchmark
npm run benchmark:wasm
```

The last command runs a short headless Chromium synthetic-canvas comparison, writes a unique report under `docs/performance-results/wasm-prototype/`, and shuts down its owned server/browser. It excludes video decoding, live monitoring/HUD, recording and actual display confirmation. It is an exploratory measurement, not a device acceptance test.

## Exploratory result and decision

Three short synthetic runs are retained. The first two cover scalar only; their timings vary materially, and the first predates revision fields in the automated report. Use them as historical observations, not stable hardware benchmarks.

The [latest run](performance-results/wasm-prototype/synthetic-9c126c35-0f9c-4b47-96df-2157942838d9.json) compares all three backends, using five warmup frames and twenty measured frames at 1280×720:

| Preset | JS complete CPU path p95 | Scalar WASM p95 | SIMD WASM p95 |
|---|---:|---:|---:|
| TapeSat | 20.9 ms | 19.0 ms | 17.8 ms |
| TapeWow | 33.3 ms | 29.1 ms | 34.1 ms |
| TapeSat + TapeWow | 43.6 ms | 39.8 ms | 43.9 ms |
| Moog | 108.4 ms | 117.2 ms | 110.8 ms |

These values include copies into/out of WASM. They do not support promoting either WASM build as the default: the combined tape path remains above the 25 ms budget, Moog shows no useful gain, and SIMD is not consistently faster. Source content, headless browser behavior, short warmup and run order differ from the user's video benchmark; these figures cannot be compared directly to the earlier user reports.

Next: obtain matched long video runs from the new harness; prototype GPU-resident compatible processing/capture; retain sequential nonlinear filters on CPU until a separate measured optimization passes fidelity. A worker addresses responsiveness but does not remove their sample dependencies. The production stochastic control/state contract remains an integration gate.

Primary build reference: [Emscripten project compilation](https://emscripten.org/docs/compiling/Building-Projects.html), consulted 2026-10-11.
