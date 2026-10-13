# P07 — Spatial video Procamp decision

Status: **conditional keep for a validated GPU-resident video segment; reject a per-node GPU island in the production planner until app routing is tested.** The compute prototype preserves exact output in the measured cases and was faster in three fresh-browser focused runs, but the same test showed a large tail after prior GPU work in the full suite.

The prototype is [WebGpuProcAmp](../../../src/engine/backends/webgpu-procamp.ts). It uploads a packed RGBA frame to a storage buffer, computes Procamp in place, then maps a readback. The CPU control calls the existing `ProcAmpFilter`. Three parameter sets covered nonzero chroma phase, saturation, pedestal, gain, clipping and audio-peak gain. All 18,432,000 compared output bytes matched exactly.

| Fresh focused run | CPU p95 / mean | GPU upload+dispatch+readback p95 / mean |
|---|---:|---:|
| 1 | 9.9 / 7.13 ms | 6.7 / 5.52 ms |
| 2 | 10.1 / 7.23 ms | 6.2 / 5.37 ms |
| 3 | 10.3 / 7.28 ms | 6.9 / 5.41 ms |

The focused GPU p95 is 3.2–3.9 ms lower than CPU while including both hardware crossings, which is a promising result for AMD GCN-5/Chrome. In an earlier run after other GPU tests in the full suite, GPU p95 was 29.1 ms vs CPU 12 ms. Keep that outlier visible; it means map/scheduler contention and session state can erase this kernel-level margin. Raw focused measurements and conditions are [here](procamp-ab.json).

The application has not been routed through this shader. A standalone GPU node still incurs upload and readback and can interfere with existing audio/video order. If applied, only select it inside a contiguous GPU-resident video segment, batch/fuse compatible nodes while preserving each intermediate byte-quantization boundary, and return at one established CPU consumer boundary. Require a visible app A/B, per-session fidelity preflight, lifecycle/fallback tests and named-device repeatability before any planner entry. The next useful test is Solarizer/Colorizer as part of that resident segment, with exact CPU comparison; do not expand to all spatial filters yet.

Verification: production build passed; full split GPU suite passed 8 tests before the varied-parameter assertions were added; afterward the focused expanded Procamp test passed three independent invocations, each 1 test, with byte-exact output.
