# Experimental WebGPU TapeSat

## Status

The benchmark offers `Experimental WebGPU (TapeSat only)`. The application continues to use JavaScript. TypeScript and benchmark bundling pass; shader execution, numerical fidelity and performance are **unverified**. Headless Chromium in this environment returned no adapter with its default configuration and with three software/Vulkan configurations. The GPU browser test records a skip when no adapter exists.

## Algorithm and ownership

TapeSat's independent saturation is followed by two linear smoothing recurrences. Each recurrence is represented by an affine map `s_next = a*s_previous + b`. Threads process ordered 256-sample tiles. Separate compute dispatches scan tile summaries by doubling the prefix length. A correction pass applies the preceding tile's state; a separate dispatch saves the final state for the next frame. The tone stage consumes the completed bump stage. Workgroup or frame boundaries never intentionally reset filter history.

The prototype uses f32 arithmetic, while the reference retains JavaScript double state. Before running GPU measurements, the sample gate is maximum absolute error <= 1e-4 and RMS error <= 1e-5. These are candidate gates, not a claim of exact equivalence. Pixel comparisons, parameter extremes, sample-rate changes, longer continuity sequences and 720p frames remain required before promotion.

Each call owns its intermediate buffers and returns an owned Float32Array. Overlapping calls and reset during processing are rejected. Dispose destroys the device; pending map operations must terminate before an old frame can be presented. The benchmark permits one frame in flight and checks its generation after awaiting GPU processing.

## Measurement scope

Only the benchmark's unsigned 8-bit interleaved RGB TapeSat preset is exposed. CPU capture and serialization, full GPU upload/readback, decoding and canvas submission remain in the measured path. Audio, HUD and physical display completion remain excluded. Intermediate buffers are allocated per call in this first prototype; performance measurements must include that cost. Buffer reuse, a workgroup parallel tile scan and GPU-resident capture/presentation are subsequent optimizations contingent on fidelity evidence.

Choose TapeSat only, select the GPU backend, load the same known 30 fps video, and run the existing benchmark. Unsupported presets and unavailable adapters produce an explicit error and restore controls. Download the report, including adapter details. A report alone does not close the accuracy gate. Run `npx playwright test tests/browser/webgpu.spec.ts` on a machine exposing a WebGPU adapter to execute the boundary/history fixture; its software adapter configuration is functional validation only.

## Next gates

1. Execute WGSL compilation and the declared numerical fixture on an available adapter. Fix validation errors without weakening the declared error bounds.
2. Expand comparison to parameter extremes, sample rates, full 720p sequences and decoded pixels; test device loss and cancellation during readback.
3. Measure the complete prototype path against JavaScript using the same source and device. No GPU performance result currently exists.
4. If faithful, reuse buffers and move capture, serialization and presentation onto the GPU; gather only the audio/HUD sample indices needed by the application.
5. Run named desktop and physical phone acceptance at 720p30, including sustained processing, audio and HUD. TapeWow and Moog are not supported by this backend.

The portable affine scan follows the [WGSL specification](https://gpuweb.github.io/gpuweb/wgsl/). GPU dispatch separation is necessary because a workgroup barrier cannot coordinate separate workgroups. Browser capability checks follow [Chrome's WebGPU documentation](https://developer.chrome.com/docs/web-platform/webgpu).
