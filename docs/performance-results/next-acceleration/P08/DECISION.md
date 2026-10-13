# P08 — Temporal video decision

Status: **conditional keep Vidicon as a GPU-session history candidate; defer FrameDelay.** Added [WebGpuVidicon](../../../src/engine/backends/webgpu-vidicon.ts) with persistent per-pixel Float32 trail state. It processes 20 changing 720p frames, edits decay/tint parameters halfway through without resetting state, then explicitly resizes and checks a clean-state output. Three repeated focused runs matched the CPU output exactly across 73,728,000 bytes per run and had zero error on the resize/reset check.

| Run | CPU p95 / mean | GPU upload+compute+readback p95 / mean |
|---|---:|---:|
| 1 | 9.7 / 7.40 ms | 6.5 / 7.03 ms |
| 2 | 8.6 / 7.23 ms | 6.8 / 7.17 ms |
| 3 | 9.2 / 7.30 ms | 6.8 / 7.05 ms |

GPU p95 is consistently 1.8–3.2 ms lower, while average processing is only about 0.2 ms faster. This is a useful tail-latency signal, but the map-per-frame result does not represent app presentation or a retained GPU output consumed by later filters. Only AMD GCN-5 headless Chrome was tested; mobile memory and thermal pressure remain unknown. Full measurements are [here](vidicon-ab.json).

At 720p, the explicit history buffer is 11,059,200 bytes (10.55 MiB). The prototype's input and readback buffers add 3,686,400 bytes each, for about 17.6 MiB of owned GPU buffer payload before driver allocations. A 16-frame RGBA FrameDelay ring alone would require 58,982,400 bytes (56.25 MiB) at this resolution, before its blended-output and work buffers. Defer FrameDelay on phone until a memory budget and a truly resident chain exist.

Application route: retain trail state in a persistent GPU session; reset it explicitly on resize/preset reset, submit every processed frame in order, and avoid mapping the output between compatible GPU filters. Keep CPU fallback for unsupported adapters and memory caps. Do not enable the standalone per-frame map path in the app until a visible browser test establishes a full-path benefit. FrameDelay, freeze/stutter, bypass/reorder, and long-session memory behavior remain untested.

Verification after the resize/state-reset fix: production build passed; three focused Vidicon tests passed, each 20 frames and byte-exact; each also passed the 65×47 resize/reset fixture.
