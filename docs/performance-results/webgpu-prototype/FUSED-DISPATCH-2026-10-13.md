# WebGPU fused apply dispatch comparison

Date: 2026-10-13  
Branch: `codex/video-acceleration`  
Source: `test_60fps.mov` (1280×720, H.264, 60 fps), SHA-256 `d86a2c31d29b1e175d4ddf165b1107809b50c60e2b40f0b8c5dadaca87da77e7`  
Browser/device: Headless Chrome 155, AMD GCN-5, Windows x64, 16 reported logical processors. Adapter model was not exposed.  
Audio: AudioContext running, volume 0.  
Build: `d2c83fb70dd959e23c8967b0e589720d6f6f34d0`, dirty during the experiment.

## Change

The 720p hierarchical scan previously submitted three dispatches per DSP stage after the tile scan: apply the block carry, save the final recurrence state, and finish the filter output. The fused kernel applies the block carry, writes the stage output and saves that final state in one dispatch. The legacy path remains available through `gpu-fused-apply=off` for controlled comparisons. The 720p path uses eight DSP dispatches instead of twelve across the two stages.

The fused result was checked through GPU sample/resident preflight and CPU state handoff. GPU fidelity passed for all completed application runs. The first browser-suite attempt found an incorrect automatic bind-group entry in the experimental path; that binding was fixed, and the isolated Chrome WebGPU state-handoff test then passed. After default promotion, the full application integration test passed and reported GPU frames with no JS fallback. The combined eight-case GPU runner advanced to its final state-handoff case but did not exit; that final case passes when isolated. Treat combined-suite completion as unresolved.

## Sustained A/B runs

All runs measured for about 60 seconds with validation on and HUD off, except where noted. Each app report is under the user's Downloads folder and includes complete timing, fidelity and source provenance.

| Kernel | Report | Measured fps | Frame p50 / p95 / p99 ms | GPU completion/readback p50 ms | Missed callbacks | Fidelity |
|---|---|---:|---:|---:|---:|---|
| Control | `app-benchmark-194c93c2-ab28-4ba5-b891-402649a653b7.json` | 55.31 | 11.4 / 19.9 / 30.3 | 11.1 | 13 | pass |
| Fused | `app-benchmark-96c30350-d46a-434d-9e7a-33f8e68b8bef.json` | 56.32 | 10.2 / 17.7 / 29.1 | 9.9 | 0 | pass |
| Fused repeat | `app-benchmark-2a0f9675-b777-4a5a-a901-693f7d9cf5f9.json` | 57.08 | 9.8 / 16.5 / 26.2 | 9.5 | 2 | pass |
| Control repeat | `app-benchmark-9d5e599b-0cad-4b3c-877c-c76981a0af27.json` | 56.07 | 11.2 / 18.2 / 30.1 | 10.9 | 0 | pass |

The paired means were 56.70 fps fused and 55.69 fps control, a gain of 1.01 fps (1.8%). Mean frame-path p95 was 16.95 ms fused and 19.05 ms control. The two-run sample is small; repeat under a normal visible desktop browser before treating the size of the gain as portable.

## Secondary switches

- Turning off per-frame WebGPU validation with fused dispatch and HUD off measured 55.54 fps, frame p95 20.5 ms, versus 56.32 fps and 17.7 ms with validation on in the matched fused run. It showed no speed gain; validation remains on by default. Report: `app-benchmark-61b894bc-ff3c-4639-a51e-6da97937390d.json`.
- Turning HUD on with fused dispatch and validation on measured 53.11 fps and frame p95 24 ms, compared with 56.32 fps and 17.7 ms in the closest HUD-off run. HUD rendering had p50 2.3 ms. This is one matched pair and supports treating the HUD as a meaningful cost, not disabling it automatically. Report: `app-benchmark-bfd722a1-96e9-4541-832a-572bb46758fb.json`.
- The 5-second smoke runs measured 53.64 fps fused and 56.80 fps control, in the opposite order. They demonstrate why short samples are not used to size the sustained effect.

## Decision and next work

The fused hierarchical kernel is enabled by default in the experimental app backend because both sustained runs improved over the control and passed the existing fidelity gates. `gpu-fused-apply=off` remains available for diagnosis. This experiment does not establish sustained 60 fps, physical presentation, visible-browser behavior, or acceptance on other GPUs. The current measured desktop result exceeds the user's 30 fps floor but sits below the original 60 fps aspiration.

The dominant measured wait remains GPU completion/readback (about 9–11 ms median), while JavaScript prepare/submit is about 0.2 ms median. The next optimization experiment should focus on reducing GPU work or readback serialization. A multi-frame readback ring is a larger architectural change: it needs independent frame resources and ordered audio delivery to preserve filter history and sound timing, so it should be prototyped only with explicit queue-bound, cancellation and stale-frame tests.
