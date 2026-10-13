# P09 — Shiftr recurrent CPU decision

Status: **conditional keep as a CPU/WASM segment candidate; do not route production through WASM yet.** Shiftr was selected after the P06 triage found a strong previous-sample recurrence and extreme JS cost. Scalar and SIMD WASM ports preserve its output and recurrent state across uneven chunk/block boundaries; parameter updates/reset and arena equivalence are covered by the conformance suite. Full browser app integration controls remain absent.

## Results

Three headless Chrome synthetic 720p canvas CPU-path runs compared JS, scalar WASM, scalar WASM using P05 arena, and SIMD WASM. Shiftr uses 2 warmup and 5 measured frames per report because the JS control is slow; it should not be compared with the other filters' 20-frame samples as if the precision matched. Reports: [run 1](P09-shiftr-run1.json), [run 2](P09-shiftr-run2.json), [run 3](P09-shiftr-run3.json). p95 DSP / full-path milliseconds:

| Run | JS | Scalar WASM | Scalar + arena | SIMD WASM |
|---|---:|---:|---:|---:|
| 1 | 58.2 / 69.1 | 52.7 / 63.2 | 51.4 / 62.4 | 52.5 / 66.2 |
| 2 | 57.8 / 67.8 | 52.6 / 62.5 | 50.7 / 60.8 | 52.2 / 61.0 |
| 3 | 60.5 / 70.0 | 53.0 / 65.9 | 53.0 / 62.9 | 52.8 / 63.3 |

Scalar WASM reduces DSP p95 by 5.2–7.5 ms; arena scalar by 6.8–9.7 ms. The SIMD build does not improve on scalar. The complete CPU path still p95s at 60.8–66.2 ms, well above the 25 ms frame target; capture/readback, stream conversion, output submission, display and application consumers are not all represented. There are only five measured frames, so treat the ranking as promising rather than final.

## Application decision

Keep scalar WASM Shiftr as a supported experimental CPU segment, with the tested JS implementation as fallback. Do not mix it as a one-node island when the full stream must cross into WASM; route it only as part of a contiguous CPU segment or arena where other compatible nodes can share the boundary. Before enabling it, implement equal JS/WASM app controls and test visible audible playback, state resets, preset/rack changes, export behavior and long histories at 30 fps. Keep SIMD selection off for this filter until larger matched samples show a win.

Verification after adding Shiftr: `node scripts/build-wasm.mjs`, `npm run build`, and `npm run test:wasm` passed (11 tests total). Correctness is exact within the existing WASM sample bound; arbitrary random/time policies remain out of scope.
