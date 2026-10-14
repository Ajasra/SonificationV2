# Acceleration test report and verdict

Date: 2026-10-14. Scope: proposals P00–P13 in [the test plan](../../NEXT_ACCELERATION_TEST_PLAN.md). The local automated test campaign passed. The full product/device rollout is **not approved**: several proposal subtests require visible-device runs or missing route controls, and the 30 fps application report still carries an unresolved dirty-build bit.

## Automated local result

`npm run test:acceleration` passed all 8/8 gates on clean revision `8e2e127782e0b27b0dd975670722886d204a0a6e` in Windows x64 / Node 22.12.0. The immutable local report is `automated-runs/2026-10-14T013222-743Z-52d0cc6d.json` (that directory is ignored; the report records clean tree, exact commands, durations and exit codes).

The gates were: Node suite 71/71; WASM conformance 11/11; production build; benchmark build; four benchmark/worker browser tests; two app-GPU integration tests; eight GPU kernel/temporal tests; and one separate compact-monitor/state-handoff test. The GPU suite is stable when split into separate Chrome processes. No tests failed or timed out.

## 30 fps application benchmark

The source was transcoded from the checked-in 1280×720 clip to 30 fps and verified independently with `ffprobe`. Source SHA-256: `8a3bed3a381a76f9c8dd81d6ffa9045272c285212417671119a7fed8cc6ae008`. A 60-second headless Chrome run used GPU TapeSat, active audio at volume 0.25, HUD on, validation on, and profile off. The AMD GCN-5 adapter reported fidelity pass and texture capture.

The run processed 1,774 frames over 59.94 measured seconds: **29.60 fps**, frame-path p50/p95/p99 **10.0/15.4/36.5 ms**, and one missed-presented-callback proxy event. It meets the numeric 720p30 throughput (≥29.4 fps) and p95 (≤25 ms) gates for this headless GPU TapeSat configuration. This does not prove physical display or sound, and the report says `build.dirty=true` despite naming the current commit. Treat it as a strong diagnostic, not a clean-build release receipt. See [raw report](P00/app-benchmark-9f67c4cd-2c9d-4697-8d5d-ef1fb433c785.json) and [P00 decision](P00/DECISION.md).

## Proposal verdicts

| ID | Verdict | Evidence and integration decision |
|---|---|---|
| P00 Baselines | **Conditional pass** | Repeatable local suite and verified 30 fps headless GPU result. Clean dirty-bit provenance, visible-device proof, equal app JS/WASM controls, and measured transfer ledger remain. |
| P01 Capture/upload | **Conditional, per source** | Matched texture capture beat reference-byte mode in an earlier file cohort. The generated browser fixture failed texture pixel fidelity and selected reference bytes; the new 30 fps transcode passed the gate and selected texture. Gate capture by source/device and keep reference bytes as fallback; no zero-copy claim. |
| P02 Dispatch | **Inconclusive** | Counterbalanced fused results did not separate from run variation; validation-off had no stable gain. Keep validation on and preserve the fused control. |
| P03 Monitoring/HUD | **Keep current policy** | HUD-off throughput gain was noisy and p95 did not improve consistently. Compact monitor/state mapping passes; demand-driven gather variants and consumer-index coverage remain untested. Keep audio/HUD on. |
| P04 Readback ring | **Conditional prototype** | Two slots improved a 20-frame synthetic Vidicon batch by 15–19%, with exact output and bounded queue. App source-generation, device-loss, audio-order and extra-age gates remain. Do not enable in app yet. |
| P05 WASM arena | **Conditional prototype** | Owned arena removes two logical copies and preserves conformance. Three runs show mixed whole-path results; no physical bus saving or app-level win established. |
| P06 Pointwise/audio kernels | **Selective CPU/WASM; GPU group rejected** | Amplify is cheap, Shiftr dominates the tested chain and is recurrent, Wavefolder is moderate. Shiftr scalar WASM is the only promising candidate; the full JS chain is not stateless GPU work. No app-level route comparison. |
| P07 Spatial video | **Conditional Procamp only** | Procamp GPU prototype is byte-exact in tested fixtures and faster in isolated upload/dispatch/readback samples. Keep only inside a persistent compatible GPU segment; do not create a one-node island. Other spatial filters wait on resident-rack evidence. |
| P08 Temporal video | **Conditional Vidicon only** | Twenty-frame GPU history, parameter edit and resize reset match exactly. Vidicon/ring remain isolated prototypes. Defer FrameDelay until its 56.25 MiB base history plus total resource budget and lifecycle tests are measured. |
| P09 Recurrent CPU | **Selective candidate** | Shiftr scalar WASM improves its short DSP measurements; SIMD did not beat scalar. WASM TapeWow and Moog lose to JS. Keep JS as default; test Shiftr only as a contiguous CPU/WASM segment after app controls exist. |
| P10 GPU TapeWow | **Reject current prototype** | Dry-pass identity error 1.0; wet RMS error 0.7213. Timing is invalid. Do not integrate. A fresh port must first pass a copy-kernel smoke test and exact state/control conformance. |
| P11 Segment planner | **Defer** | The route cost matrix and cross-backend state migration evidence do not exist. Any automatic selector would encode assumptions. Use reference fallback until three matched pairs per legal route class are available. |
| P12 Worker scheduler | **No adoption** | Three runs preserve exact Shiftr output, but worker round-trip p95 (16.5–32.9 ms) loses to JS (6.6–7.1 ms); timer samples do not prove a responsiveness benefit. |
| P13 Export/device rollout | **Not approved** | Benchmark JSON export smoke test passes. Offline MP4 pixel/sample/timestamp/abort/history parity, 300-second sessions, camera path, physical Android/iPhone, HTTPS assets and deployed fallback/cache tests remain. |

Per-proposal evidence is in [TEST_PROGRESS.md](TEST_PROGRESS.md) and the adjacent decision files. Negative and conditional outcomes are not production wins.

## Hardware boundary and next release gate

Automation now runs every local correctness/build/browser/GPU group with `npm run test:acceleration`, writes an exact per-run JSON record, and fails on any failed or timed-out group. `npm run test:acceleration -- --skip-gpu` is only for hosts without WebGPU; that report explicitly marks the GPU groups skipped.

This host cannot prove phone thermals, camera behavior, physical presentation/audio, offline MP4 fidelity, or deployment cache/fallback behavior. Those require named physical devices and the deployed HTTPS environment. Before any broader app routing, clear the dirty bit, repeat the 60-second 30 fps run from a clean committed tree, compare equivalent app-level JS/WASM/GPU routes, and test each route's transfers, synchronization, state handoff and consumer packet. A production planner remains off until that matrix contains at least three matched pairs per route class.

For now, keep JS as the safe reference and GPU access opt-in with exact per-source fidelity fallback. When a route is proven, keep consecutive compatible stages resident on one owner and perform one entry transfer and one bounded result gather. Do not bounce each filter between CPU and GPU. Treat the WASM arena and two-slot ring as conditional implementation candidates; reject automatic routing and worker scheduling on current evidence.
