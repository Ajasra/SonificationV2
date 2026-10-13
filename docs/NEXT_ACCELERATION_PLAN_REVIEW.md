# Independent review of the next acceleration plan

Date: 2026-10-13. Reviewed initial draft: `NEXT_ACCELERATION_TEST_PLAN.md`, based on code revision `d48b74099e3ce0b6f5c7e67006b57a22800966bc`. This is a planning review, not runtime performance verification.

## Findings and corrections

The reviewer classified the draft as mixed, close to promotion: concrete experiments and acceptance intent, with unresolved details concentrated at measurement, queued-state and planner boundaries. No remaining planning blocker was identified after the corrections below. They are incorporated in the [final plan](NEXT_ACCELERATION_TEST_PLAN.md).

| Finding | Evidence | Applied correction |
|---|---|---|
| Transfer ledger could imply knowledge of hidden copies | [WebGPU Explainer](https://gpuweb.github.io/gpuweb/explainer/), consulted 2026-10-13; browser-process/ownership boundaries | Count observable API payloads/app copies and modeled lower bounds; label unknown browser/driver work and avoid physical-bandwidth claims |
| Divider is sequential, despite its distortion category | `src/engine/filters/distortion/divider.ts:47`: zero crossings, last sample, counters and accumulated amplitude | Removed from pointwise cohort; assigned to CPU-first recurrent/stateful experiments |
| Runner confounds profiling and primary audio acceptance | `scripts/benchmark-app-gpu.mjs:108` forces profiling; `:112` sets volume zero | P00 requires explicit profiling, audible-audio/volume, source-cadence and HUD controls; profiled and primary runs are separate cohorts |
| Two-slot readback needs explicit state/presentation ownership | `src/engine/backends/app-tapesat.ts:59` seeds per invocation; `src/main.ts:1024` reads/imports state after completion | Added slot state machine, submission-order DSP history, ordered commit, owned render textures, stale-generation suppression, drain/retire before reseed and failure handling |
| Automatic planner costs lacked confidence/freshness rules | Current integration is an eligibility gate, `src/engine/backends/gpu-eligibility.ts:5`, with no general planner | Bounded three route classes; provenance keys, three matched pairs, invalidation, whole-route verdict, static fallback and explicit session horizon for amortization |
| Shared monitor contract needs exact index/fidelity identities | `src/audio/sound-camera.ts:99`; `src/main.ts:1036`; HUD scope stride formulas | Added named consumer/index fixture; separated byte-exact vs bounded numerical conformance and state-migration evidence |

## What holds

The review confirmed the current WASM copy boundary (`src/engine/backends/wasm.ts:83`) and fixed 64 MiB memory configuration (`scripts/build-wasm.mjs:24`). A resident CPU arena is a valid experiment, with speed still to be measured.

Feedback progressively updates the history it samples (`src/engine/video-filters/optic/feedback.ts:93`); RF Tuner reads modified row pixels (`src/engine/video-filters/sync/rftuner.ts:82`); raster scatter effects have colliding writes. Keeping these on a CPU/reference route until order-preserving proof is appropriate. FrameDelay's sixteen RGBA frames and blended-output ring storage support the explicit memory/state gate.

The existing JS reference, ordered-segment approach, matched AB/BA runs, separate headless/60 fps cohorts, audible-audio/HUD acceptance and per-window sustained checks remain in the promoted plan. The final queue still requires each proposal to pass its own correctness, full-path performance, resource and integration gates before adoption.
