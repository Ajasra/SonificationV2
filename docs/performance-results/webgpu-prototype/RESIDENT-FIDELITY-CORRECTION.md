# Resident fidelity correction evidence

The user pasted diagnostic run `455b4b8d-d2cd-46cf-987e-6cc5e89df075` from revision f9f6bcc (dirty true). Its sample-only fixture passed, but resident cases reported maximum sample errors 0.0134155/0.0134018, RMS approximately 7.2e-5, maximum pixel error 255, and compact errors 0.00362116/0.0123363. No performance run occurred. Adapter strings were empty. This note records the pasted evidence; it is not an original downloaded report.

## Local reproduction and changes

Installed Chrome, launched headlessly with WebGPU enabled, exposed AMD GCN-5 while bundled Chromium exposed no adapter. This allowed actual shader execution and decoded-video tests.

1. Replaced asynchronous canvas inspection with diagnostic rendering into an owned GPU texture and explicit texture-to-buffer readback, including aligned rows and channel order conversion. Canvas swapchain textures can expire/present while waiting for sample mapping; that read was unsuitable for pixel comparison.
2. Added exact raw sample capture comparison. On decoded VP8 video, it identified a one-byte RGB difference between CPU and GPU conversion (maximum sample input difference 0.00784314) that produced filtered error approximately 0.0143. Rasterizing through the reference sRGB 2D canvas eliminated this difference locally.
3. Repeated-frame comparison now uses the captured reference RGBA bytes. Repeating conversion of the YUV-backed bitmap produced another compact mismatch despite the first capture/filter/render matching; the history test needs identical input bytes in both references.

The reference raster does not call getImageData in the measured path. It retains a browser-managed canvas capture/upload cost; claims of fully GPU or zero-copy capture are withdrawn. Filtering, stream mapping and display remain GPU operations; full sample readback remains diagnostic-only, with 24,576-byte playback/preview readback during measurement.

## Validation boundaries

Three installed-Chrome GPU tests passed locally: filter tile/frame history, full-size resident capture/render/gathers and a complete decoded-video benchmark. Synthetic resident maximum sample error was 2.384e-7, capture difference zero and rendered pixel difference zero. This does not certify the user's MP4 on their adapter, all browsers, phone hardware or the 720p30 sustained target.

The completed decoded-video fixture report is preserved as `synthetic-amd-smoke-b98e4a19-26de-4eda-8d75-5caa7e72e00f.json`, extracted unchanged from the Playwright JSON attachment. Both resident cases have zero capture and rendered-byte differences, max filtered error 2.384e-7 and compact error <=2.384e-7. Its approximately one-second synthetic measurement is functional evidence only; MediaRecorder cadence, looping, headless conditions and concurrent Node tests prevent performance acceptance or a comparison with the user's video.

Original limits remain maximum filtered error 1e-4, RMS 1e-5, maximum pixel byte error one; exact raw capture adds a stricter zero-error gate. The next user report includes separate capture errors and sample locations if their driver still differs.
