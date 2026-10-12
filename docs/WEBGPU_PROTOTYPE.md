# Experimental WebGPU TapeSat

## Status

Second capture fix: ImageBitmap creation was still attempted before playback began and failed with an unusable source in the physical browser. Resident preflight now plays the source, waits for requestVideoFrameCallback, snapshots inside that callback, then pauses playback. The CPU/GPU comparison uses the same frozen ImageBitmap for both frames. A 15-second timeout and cancellation release the callback and any late snapshot. A real browser video test exercises this lifecycle without requiring WebGPU. The affected physical MP4 remains the verification gate.

Capture compatibility fix: a physical-browser run reported that direct video texture import had no backing resource during the paused preflight. Video capture now creates an owned ImageBitmap snapshot before GPU texture copying, retaining it through completion and closing it in finally. No full video pixels are read into JavaScript. Snapshot cost is included in total elapsed time and reported as gpuSourceSnapshotMs with profiling. Browser-internal snapshot copies are implementation dependent; this is not a zero-copy claim. The next physical run must verify the fix and color fidelity.

2026-10-12 continuation: the benchmark now offers `GPU capture + display (TapeSat only)`. It uses a copied GPU texture, the reference Float32 RGB lookup table, GPU stream mapping/filtering, and direct canvas rendering. Each measured frame reads back 6,144 samples (24,576 bytes): the exact 4,096 playback indices and first 2,048 preview values. This excludes HUD/audio playback integration; physical display completion remains unmeasured. Source size must be exactly 1280x720 for this prototype.

The resident path has an additional preflight comparing synthetic opaque RGB bytes and the paused source frame against CPU capture/processing: full samples, rendered pixels (maximum one byte level) and compact gather indices. Failure blocks measurement. Full sample readback is used only in the preflight diagnostic. Resident execution and performance remain unverified until a capable browser supplies the next report.

Both GPU modes now use a workgroup parallel affine tile scan, retaining ordered dispatches for tile carry and frame state. Buffers/uniform buffers and the input texture are reused when their sizes/usages match, and the reference lookup table is uploaded once. Bind groups are still constructed per frame. Existing sample bounds remain unchanged; the previous GPU fidelity report describes the earlier sequential-tile implementation and cannot certify this replacement.

The subsequent [60-second physical desktop run](performance-results/webgpu-prototype/60-SECOND-ANALYSIS.md) passed the implemented sample fidelity fixture on NVIDIA Ampere at all three sample rates. Throughput was 16.80 fps and complete-path p95 51.9 ms. GPU completion/map wait was the largest measured segment (33 ms p95), combining execution and transfer/scheduling overhead. Performance and broader acceptance remain open.

The benchmark offers `Experimental WebGPU (TapeSat only)`. The application continues to use JavaScript. The first user-supplied NVIDIA Ampere desktop report confirmed shader execution: 20.73 fps and 39.3 ms complete-path p95 over approximately 10 seconds. See [the initial report analysis](performance-results/webgpu-prototype/ANALYSIS.md). Headless Chromium in this environment returned no adapter with its default configuration and with three software/Vulkan configurations. The GPU browser test records a skip when no adapter exists.

## Algorithm and ownership

TapeSat's independent saturation is followed by two linear smoothing recurrences. Each recurrence is represented by an affine map `s_next = a*s_previous + b`. A 256-thread workgroup computes the ordered prefix within each tile; all lanes participate in barriers, with identity maps for trailing padding. Separate compute dispatches scan tile summaries by doubling the prefix length. A correction pass applies the preceding tile's state; a separate dispatch saves the final state for the next frame. The tone stage consumes the completed bump stage. Workgroup or frame boundaries never intentionally reset filter history.

The prototype uses f32 arithmetic, while the reference retains JavaScript double state. Before running GPU measurements, the sample gate is maximum absolute error <= 1e-4 and RMS error <= 1e-5. These are candidate gates, not a claim of exact equivalence. Pixel comparisons, parameter extremes, sample-rate changes, longer continuity sequences and 720p frames remain required before promotion.

Each call owns its intermediate buffers and returns an owned Float32Array. Overlapping calls and reset during processing are rejected. Dispose destroys the device; pending map operations must terminate before an old frame can be presented. The benchmark permits one frame in flight and checks its generation after awaiting GPU processing.

## Measurement scope

GPU runs now start with a JavaScript/GPU sample comparison at 8 kHz, 44.1 kHz and 96 kHz, including parameter changes, tile boundaries and two full 720p sample blocks. A failed check blocks measurement and exports a diagnostic JSON. Successful checks reset GPU history before warmup and are included under `gpuFidelity` in the downloaded report. The check is an implementation gate; it does not certify pixel identity, all parameters, phones or the full application.

With profiling enabled, reports additionally record stream encoding, CPU GPU preparation/submission, elapsed validation/completion/map wait, mapped buffer copying and stream decoding. Completion/map wait combines GPU execution, transfers, scheduling and API overhead; these are wall-clock measurements, not GPU timestamp queries. Profiling overhead remains part of the run.

Only the benchmark's unsigned 8-bit interleaved RGB TapeSat preset is exposed. The original GPU mode retains CPU capture/serialization, full upload/readback, decoding and canvas submission. The resident mode includes texture capture, GPU serialization/filter/render and compact readback. Both wait for readback completion before counting a processed frame. Audio, HUD and physical display completion remain excluded. Reports identify each mode and explain timing semantics; in resident mode capture/output-submit fields are zero because those operations are included in GPU preparation and completion.

Choose TapeSat only, select the GPU backend, load the same known 30 fps video, and run the existing benchmark. Unsupported presets and unavailable adapters produce an explicit error and restore controls. Download the report, including adapter details. A report alone does not close the accuracy gate. Run `npx playwright test tests/browser/webgpu.spec.ts` on a machine exposing a WebGPU adapter to execute the boundary/history fixture; its software adapter configuration is functional validation only.

## Next gates

1. Execute WGSL compilation and the declared numerical fixture on an available adapter. Fix validation errors without weakening the declared error bounds.
2. Expand comparison to parameter extremes, sample rates, full 720p sequences and decoded pixels; test device loss and cancellation during readback.
3. Measure the complete prototype path against JavaScript using the same source, preset and device. The first GPU report has no matching physical-device JS TapeSat-only baseline.
4. If faithful, reuse buffers and move capture, serialization and presentation onto the GPU; gather only the audio/HUD sample indices needed by the application.
5. Run named desktop and physical phone acceptance at 720p30, including sustained processing, audio and HUD. TapeWow and Moog are not supported by this backend.

The portable affine scan follows the [WGSL specification](https://gpuweb.github.io/gpuweb/wgsl/). GPU dispatch separation is necessary because a workgroup barrier cannot coordinate separate workgroups. Browser capability checks follow [Chrome's WebGPU documentation](https://developer.chrome.com/docs/web-platform/webgpu).
