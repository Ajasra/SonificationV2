# CPU filter baseline — P06/P07/P08/P09 candidate triage

Source: existing `node scripts/benchmark-pipeline.mjs`, captured 2026-10-14 (timestamp in raw JSON), Node 22.12.0, synthetic 640×480 fixtures, warmup plus short per-filter loops. The script reports mean frame time, not sustained application p95. Raw JSON: [CPU pipeline baseline](cpu-pipeline-2026-10-14.json). Audio microbenchmark numbers are preserved here from the command output because the script's JSON omits them.

## What the baseline says

- **P06 pointwise/audio candidates:** stream encode/decode measured 1.21/1.80 ms; Wavefolder 12.98 ms, TapeSat 3.92 ms. Amplify, Shiftr, and Wavefolder were not run as one pointwise chain nor across JS/scalar/SIMD/GPU. Wavefolder is worth profiling; the fast color transforms and conversion costs alone do not justify moving a single node across hardware.
- **P07 spatial video:** Procamp 5.91 ms, Colorizer 3.53 ms, CVI Slicer 4.23 ms, Solarizer 1.13 ms, CRT Bloom 8.41 ms, ChromaSmear 6.56 ms. The four-filter Procamp→Colorizer→CVI Slicer→CRT Bloom CPU rack took 23.60 ms at 640×480. This makes a contiguous resident video segment the highest-value video prototype; per-filter milliseconds cannot be summed into an expected GPU gain, and no GPU candidate was benchmarked here.
- **P08 temporal video:** Vidicon 4.25 ms and FrameDelay 2.74 ms at 640×480, with one synthetic scenario each. The CPU costs alone are modest; their persistent storage/state continuity and 720p memory budget matter more than a port hypothesis. Defer until a stable GPU spatial segment exists and residency/state can be measured.
- **P09 recurrent CPU:** Moog 37.74 ms; Echo 3.17 ms; TapeWow 12.71 ms at 640×480. The separate 720p WASM test still showed Moog scalar/SIMD slightly slower than JS and TapeWow materially slower; only TapeSat→TapeWow showed a small short synthetic scalar improvement. Moog remains an important hard control. A reusable arena should precede more recurrent ports.
- **P10/P11/P12:** this baseline does not test GPU TapeWow, route planning, or worker scheduling.

## Decision

Prioritize P07's contiguous spatial GPU prototype and P05's CPU/WASM arena before optimizing fast isolated nodes. Keep the JS path as the comparison. Do not infer a full-resolution win by scaling these 480p means, and do not infer correctness from RMS/mean checksums alone. P08 can wait because current temporal CPU kernels are inexpensive in this limited fixture and GPU history residency is not yet available to compare.
