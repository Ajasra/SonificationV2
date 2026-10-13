# P06 — Pointwise audio CPU triage

Status: **reject placing the entire proposed chain on GPU as a stateless pointwise segment; prioritize Shiftr as a CPU/WASM recurrent candidate.** This test establishes CPU cost only. It does not compare WASM or GPU implementations.

Raw output: [CPU pointwise report](cpu-pointwise-2026-10-14.json). The updated `scripts/benchmark-pipeline.mjs` adds individual Amplify, Shiftr, Wavefolder and an integrated 640×480 pipeline chain to the existing baseline.

## Measurements

The 921,600-sample individual block means were Amplify 1.28 ms, Shiftr 1,207.24 ms, and Wavefolder 9.69 ms. The full 640×480 image→audio→Amplify→Shiftr→Wavefolder pipeline was 1,218.19 ms/frame. It cannot approach real-time in JS at this preset, overwhelmingly because Shiftr carries a previous-sample dependency and iterates five passes. Amplify is inexpensive, so moving it alone across a CPU/GPU boundary is unlikely to repay transfer/synchronization overhead. Wavefolder is more plausible for a WASM test but remains CPU-ordered by its current preset chain.

The report is one short Node.js synthetic run, not browser performance; it has no pixel/sample conformance checks and runs Shiftr after repeatedly resetting block inputs while its state continues. The extreme cost is large enough to prioritize a focused Shiftr implementation test, but it does not establish which backend wins.

## App mapping

Do not split the chain by node onto GPU/CPU. Test a contiguous CPU segment with an explicit Shiftr recurrence state first; compare JS to scalar WASM while preserving Float32 stores, state resets/updates and block boundaries. Amplify should stay with its neighboring CPU segment unless a resident GPU route makes it nearly free. GPU work would need an ordered scan or another proven recurrence-preserving algorithm, not independent per-sample dispatch.
