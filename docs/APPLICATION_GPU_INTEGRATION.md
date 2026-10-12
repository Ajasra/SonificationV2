# Experimental TapeSat application integration

## Scope and activation

The main application accepts `?gpu=tapesat` as an explicit experimental option. The normal application continues to use JavaScript. The option selects 720p preview initially; unsupported configurations use JS. GPU eligibility requires exactly one enabled TapeSat audio filter at 44.1 kHz, 1280x720, unsigned 8-bit interleaved RGB reader/writer with no companding, equalization, blend or enabled video filters. It applies to live camera/video in the developed view with sync mode on. Still images, recording, other views, resolutions, formats and racks use JS.

The GPU backend and fidelity harness are loaded as a separate dynamic chunk only for the experimental option. Normal startup retains its 480p selection and does not create a GPU canvas or load that backend.

GPU shaders compile and the existing sample/resident fidelity gates run before first GPU use. Application capture always uses the reference RGBA bytes directly, including any canvas reader modifications, so no independent source conversion is required. Startup may pause processing briefly for validation. Source changes cancel pending GPU operations and validate a fresh session; unsupported/device-failed cases show the JS path.

## Presentation, state and monitoring

The existing 2D canvas remains available for JS, exports and recording. A separate GPU canvas uses the same viewport layout. One frame is in flight, and generation checks suppress results after source changes. Preset/view changes during processing cannot publish a stale GPU image.

The compact GPU buffer now contains 8,194 floats (32,776 bytes):

| Range | Meaning |
| --- | --- |
| 0..4095 | Original playback stride indices, 4,096 samples |
| 4096..6143 | First 2,048 filtered samples, including the DOM meter's first 512 |
| 6144..8191 | First 2,048 raw encoded samples, before filtering |
| 8192..8193 | Final bump/tone state |

The audio engine receives the 4,096 playback values with stride one. At the eligible 720p sample count, HUD post-scope indices match the original 256-point selection exactly when it downsamples this playback array; DOM meters receive the filtered prefix, and the raw trace receives the original pre-DSP prefix. CPU telemetry clears the GPU scope override when falling back.

GPU state is seeded from the JS pipeline's retained TapeSat instance before processing, then the completed state is mirrored back after each committed frame. Removed/type/rate-changed nodes follow the pipeline's existing cache invalidation rules; bypass retains history. Approximate f32 state transfer is guarded by the existing GPU sample tolerances. A failed or cancelled frame does not overwrite state after a source-generation change. GPU validation failure is sticky for that source session to avoid repeated expensive retries; a source reset permits a new session.

Offline export stops the live frame loop before processing. Snapshot export in experimental mode cancels pending GPU work, uses JS, and restarts the appropriate source loop. Page hide disposes GPU resources and closes the audio graph. These paths retain JS recording/export behavior; native recording/export acceptance remains separate from preview tests.

## Application report

In experimental mode, the FPS badge is a keyboard-accessible download control. After 10 seconds of warmup, it collects frame-path wall time, processed GPU/JS counts and presented callback gaps. Click it while the source is playing to download `app-benchmark-<id>.json`. Changing preset, view, dimensions, audio mute, HUD or recording settings resets the warmup/measurement; changing sources resets the session.

Reports include build revision/dirty status, source name/size/SHA256 where available, audio context state, audio/HUD flags, preset, GPU validation and backend counts. Frame latency includes source capture, processing, GPU completion, audio submission and HUD telemetry updates. HUD renders independently in RAF and competes for throughput; its full draw time is not added to the frame-path latency. Physical display completion is unmeasured. Waiting or pausing after the measured playback affects the elapsed-time throughput calculation, so download during playback.

Use at least 70 seconds of stable playback for a one-minute post-warmup sample, or 310 seconds for five minutes. Record actual CPU/GPU models and power conditions alongside the report. Benchmark-only acceptance does not establish full application/device acceptance.

## Verification

Node tests cover eligibility, state import/continuity, late-created-device cancellation, sticky fallback/retry, compact audio mapping and audio disposal. Real GPU tests cover compact playback/raw/HUD indices and GPU-to-JS handoff. The installed-Chrome application test loads a decoded video, enables Web Audio at zero output gain with HUD active, downloads the application report, switches resolution/bit depth to JS and back, and replaces the source. This is functional evidence on the local adapter; audible output quality, the user's MP4 performance, recording and physical phones remain unvalidated.

The first local application smoke report is preserved as performance-results/webgpu-prototype/app-amd-smoke-2ea5c1fe-785c-452c-b2c0-0af67900fedc.json. It records 18 post-warmup GPU frames, zero JS frames, HUD enabled and a running audio context. Its short synthetic source and measurement establish functionality only; the user must supply a sustained application report before promotion. GPU test browser sessions are isolated to release native audio/codec/GPU resources between fixtures.
