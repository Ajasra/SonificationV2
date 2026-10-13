# Adaptive application capture path

The experimental application now runs the existing texture-vs-reference fidelity selection against its owned 2D source canvas. If the texture path reproduces reference input bytes, filtered samples and rendered pixels within the existing limits, each video frame is sent directly from that canvas to WebGPU. The app then avoids per-frame `getImageData` and the RGBA upload. If any gate fails, it uses the byte-exact reference route and invokes `getImageData` lazily only when that route or JS fallback needs the pixels.

The source canvas is passed directly to `copyExternalImageToTexture` only after fidelity selection. The owned-canvas path avoids another intermediate 2D raster. Direct source-video import remains unchanged because browser video backing resources have failed on supported Chromium paths.

Verification on the installed Chrome GPU: the focused application GPU test passes and chooses `reference-bytes` for its generated decoded-video input. Its texture probe reports a maximum capture error of `0.0078431` (two byte levels) and maximum rendered byte error 2, so texture capture is rejected; limits remain unchanged. The six dedicated GPU browser tests pass, as do ten targeted unit tests and the production build. The current adapter therefore does not demonstrate a performance gain from the texture path. A named-device user report must show `gpuValidation.captureMode: "texture"` before expecting lower capture cost.

For devices on which texture capture fails, this change retains the previous reference-byte performance profile. Reducing that fallback's 8 ms median CPU capture and 15 ms median GPU completion/readback requires another optimization. Do not loosen byte/sample/pixel gates to enable texture mode.
