# P12 — Worker and bounded frame scheduler decision

Status: **worker probe passes ownership/state fidelity; no app adoption**.

## Test

Added a persistent module worker probe around Shiftr, transferring each 307,200-sample Float32 block to the worker and transferring the result back. Five serial blocks compare with the same stateful JS filter on the main thread. An 8 ms timer runs during both paths as a responsiveness diagnostic. This isolates the ownership and messaging boundary; it does not exercise OffscreenCanvas, media-frame transfer, the app scheduler, GPU readback or audio/presentation commit.

Command: `npx playwright test tests/browser/worker-probe.spec.ts`.

## Result

Two focused browser runs each matched all five blocks exactly and left no pending replies. Over 12,288,000 logical bytes transferred per run, JS p95 was 7.1 and 6.8 ms; worker round-trip p95 was 19.4 and 32.9 ms. Timer coverage was 14 and 15 samples, with maximum lag of 24.4 and 22.2 ms. The worker path is slower here, and these sparse timer samples establish no responsiveness gain.

## Decision and next step

Do not add worker scheduling to the app from this result. Keep the worker prototype as a test-only boundary exercise. Revisit only after a measured app route contains main-thread work above the responsiveness budget. Then test one executing plus one replaceable pending frame, worker-owned transferred source frames, source-generation invalidation, hide/resume, start/stop, camera ownership, audio order and end-to-end commit age. A worker does not reduce DSP cost by itself.
