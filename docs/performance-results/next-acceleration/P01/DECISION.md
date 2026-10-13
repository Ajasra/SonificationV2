# P01 — Capture and upload decision

Status: **keep texture capture conditionally; reject reference-byte capture as the normal GPU path.** One matched 60-second headless AMD GCN-5 comparison has a large gap, but this is an exploratory single pair, not the plan's three-pair or visible-app acceptance cohort.

## Question and setup

Can the reference-byte capture path replace automatic texture capture without harming the 720p TapeSat app path? Both runs used commit `da477bede3357829fc9330ff7763613395ee0c51`, source `test_60fps.mov` (1280x720, 60 fps, SHA-256 `d86a2c31d29b1e175d4ddf165b1107809b50c60e2b40f0b8c5dadaca87da77e7`), AMD GCN-5 / headless Chrome, 60 seconds, validation and fused dispatch on, profile off, audio active at 0.25, HUD on. Only capture selection changed. The harness records the reports as dirty; this provenance issue is still open.

- Automatic texture: [raw report](app-benchmark-2bfb4d9c-6dfa-4138-a814-370eb0b5f1a4.json), 38.71 processed fps, frame p50/p95/p99 9.6/25.4/38.1 ms, GPU completion/readback p95 23.4 ms, fidelity passed.
- Forced reference bytes: [raw report](app-benchmark-c994e890-026b-4944-a60c-57d0523384fc.json), 24.45 processed fps, frame p50/p95/p99 18.4/51.1/112.9 ms, GPU completion/readback p95 24.9 ms, fidelity passed.

The one pair favors texture capture by 58% throughput and 25.7 ms frame p95. Since GPU completion/readback is close, the gap appears before or around capture/CPU handoff; this comparison does not isolate the precise cause. Callback-gap proxies were 226 vs 722 and are not attributed drop counts. Texture probe source sensitivity remains real: the generated browser video differed by up to two byte levels and correctly selected reference bytes, while the file fixture passed the current exact sample capture gate. Keep the exact per-source fidelity gate and fallback.

## Integration and limits

Added an explicit benchmark-only `gpu-capture=reference-bytes` override, threaded through the app GPU backend and recorded requested/selected modes in reports. It permits repeatable forced-path measurement and confirms that the reference route still passes app integration and fallback tests. Production default remains auto-selection after the fidelity probe.

Fresh CPU/GPU-backed canvas allocation, ImageBitmap/VideoFrame input, and camera capture were not compared in this slice. No physical zero-copy or bus-transfer claim follows from the texture API. P01 remains open for those source/device experiments and three-pair replication; the current difference is large enough to deprioritize reference-byte optimization against texture capture on this device.

## Verification

- Production build passed.
- Focused forced-reference app integration passed (1 test); GPU suite passed all 8 tests in isolated processes.
- Source and app output fidelity passed in both 60-second modes.
