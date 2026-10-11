# Improvement plan

Review date: 2026-10-07. Complete each stage with its verification results before advancing.

## 1. Confirm phone recovery

Run the device checklist in REVIEW.md with the current camera fixes. Capture errors and processing times when a freeze occurs. Distinguish a stalled stream from a blocked UI by checking whether controls respond.

Acceptance: repeated camera switching, background/return, and refresh work without restarting the browser. Document device-specific failures before choosing further camera workarounds.

## 2. Make recording ownership explicit

Give VideoRecorder ownership of canvas video tracks and release them after stop or failed startup. Preserve the shared audio engine tracks. Report startup success to the UI and restore timer/button/audio state on errors. Guard concurrent stop/export actions. Define background behavior so a hidden camera does not produce an unexplained frozen recording.

Acceptance: mocked acquisition/start/stop/error paths leave no owned tracks or stale UI state. On each phone, repeated exports contain moving video and audible audio. Export remains usable after a failed recording attempt.

## 3. Validate incoming presets

Use one runtime validator for URL hashes, local storage, and imports. Check stream enums, bit depth, filter IDs, finite parameter values, sample rates, and blend bounds. Bound incoming preset size and filter count. Show a recoverable error and retain a valid default preset for malformed input.

Acceptance: valid edited studies round-trip without parameter loss; invalid and oversized presets cannot crash startup or poison DSP state.

## 4. Establish a performance baseline

The detailed 720p acceleration contract is in [docs/PERFORMANCE_IMPLEMENTATION_PLAN.md](docs/PERFORMANCE_IMPLEMENTATION_PLAN.md), with the proposal review in [docs/PERFORMANCE_PLAN_REVIEW.md](docs/PERFORMANCE_PLAN_REVIEW.md). Target: 720p30 on desktops and phones, subject to named device and preset acceptance.

Measure canvas draw/readback, color conversion, stream encoding/decoding, individual filters, equalization, audio submission, and output drawing separately. Use warmed-up runs with representative light and heavy presets at 360p, 480p, 720p, and 4K still-image size. Record median and p95 latency, processed FPS, long tasks, and memory growth. Include device/browser identity with every result.

Acceptance: a reproducible benchmark report identifies the largest measured costs. Treat the existing FPS badge as a processing indicator; it does not report latency percentiles or thermal stability.

## 5. Apply measured optimizations

Start with caching filter parameter changes so unchanged presets skip coefficient recalculation. Compare output and state continuity before and after the change. Reuse scope buffers and coalesce repeated still-image render requests if profiling shows allocation or duplicate work.

Then move frame DSP and large exports to a worker. Use one frame in flight and replace queued live frames with the newest frame. Transfer buffers and retain filter state in the worker. Export should use its own pipeline state. Measure transfer/readback overhead before selecting OffscreenCanvas or another rendering path.

Acceptance: deterministic output stays equivalent within a stated tolerance; touch controls remain responsive under heavy presets; p95 processing time and long-task measurements improve on the target phones. Keep an explicit resolution control. Add adaptive preview resolution only after defining how it affects the artwork and exported output.

## 6. Stabilize audio timing

After profiling, evaluate an AudioWorklet with a bounded sample queue instead of replacing an AudioBufferSource on every frame. Define the resampling rule connecting the image sample stream, selected bus rate, and device output rate. Handle queue underflow without unbounded latency.

Acceptance: measured gaps and clicks improve when frame rates fluctuate; monitor mute and recording audio stay independent; the queue remains bounded during backgrounding and camera switches.

## 7. Finish sharing and modularity

Remove the fixed LAN host default, use the current reachable origin when possible, and retain a host override for desktop localhost. Split camera/input control, recording UI, and preset UI out of main.ts after recovery behavior is covered by tests.

Acceptance: links target the intended device address, edited presets survive handoff, and the extracted controllers pass the existing lifecycle checks.
