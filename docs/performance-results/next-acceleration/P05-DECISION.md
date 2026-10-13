# P05 — WASM sample arena decision

Status: **conditional prototype; do not route the application through it yet.** The arena API passes sample/state equivalence and removes the explicit JS→WASM input copy and WASM→JS output copy when the pipeline's Float32 view is the runtime's owned arena. Three synthetic 720p comparisons show no repeatable whole-path p95 improvement for the measured filters.

## Implementation and correctness

Added an optional `sampleBufferFactory` to `SonificationPipeline` and `WasmDspRuntime.getSampleBuffer()`. `processSegment()` detects only the exact base arena view and runs in place; ordinary caller-owned Float32 arrays retain the existing copied behavior. The 64 MiB non-growing module memory keeps the borrowed arena view stable. The reference/export route remains unchanged. Added an arena/copy conformance test.

- `npm run build`: passed.
- `npm run test:wasm`: 10 passed, including sample and state equivalence.
- All timing runs were synthetic 1280×720 canvas CPU paths with 5 warmup and 20 measured frames; browser decode, HUD, audio consumer, worker and display confirmation are excluded.

## Three-run comparison

Raw reports: [run 1](../../wasm-prototype/synthetic-6683ac8a-072a-4ce7-91f6-9dd228983f45.json), [run 2](../../wasm-prototype/synthetic-3e180b77-03be-46ee-94bf-ad8927364473.json), [run 3](../../wasm-prototype/synthetic-65a501ee-6f31-432b-a0af-cfac25724793.json). Complete CPU-path p95, copied scalar WASM → arena WASM:

| Filter chain | Run 1 | Run 2 | Run 3 | Reading |
|---|---:|---:|---:|---|
| TapeSat | 19.0 → 16.9 ms | 18.0 → 25.1 ms | 18.3 → 16.1 ms | Arena wins twice; one large regression |
| TapeWow | 41.1 → 43.8 ms | 41.6 → 44.9 ms | 49.5 → 43.3 ms | Arena loses twice |
| TapeSat→TapeWow | 56.1 → 64.0 ms | 57.9 → 57.4 ms | 59.6 → 61.8 ms | No repeatable improvement |
| Moog | 120.6 → 119.6 ms | 119.3 → 116.4 ms | 123.8 → 118.1 ms | Small but consistent improvement, still far above 30 fps budget |

These measurements ran variants serially in a fixed order and have only 20 measured frames per variant; the confidence is limited. DSP work dominates TapeWow and Moog. The copy reduction is real, but not sufficient evidence for application adoption. Do not claim measured bus bandwidth reduction: the change removes logical copies within one WASM memory owner.

## Application decision

Keep `sampleBufferFactory` optional and retain the ordinary pipeline as default. It is a candidate for follow-up if an app-supported CPU segment can use one arena for serialize→DSP→reconstruct and deliver its actual monitor samples before the next reuse. Before enabling it in the app, add lifecycle/reallocation/disposal coverage, compare browser pipeline controls with identical rack/source, and include current-frame audio sampling and recorder consumers. P05 remains open for browser-app testing and an API-owned arena ledger.
