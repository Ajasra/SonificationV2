# Automated application GPU run

From the repository root, run:

```powershell
npm run benchmark:app-gpu
```

The runner uses `test_60fps.mov` in the repository root by default. This local benchmark input is a 1280×720 H.264 video at 60 fps, about two minutes long; a full decode check completed without errors. It has no audio stream, which is expected because the app generates audio from the video frames. The runner starts a temporary loopback Vite server, opens Chrome with WebGPU enabled, selects the 720p GPU path, enables the audio context at zero volume, loads the video, waits for the requested measured time, downloads the JSON benchmark report to `Downloads`, and stops the browser and server.

The default measured time is 60 seconds, in addition to the application's warmup. To shorten a diagnostic run or choose another file:

```powershell
node scripts/benchmark-app-gpu.mjs --duration 10
node scripts/benchmark-app-gpu.mjs --video "D:\\media\\clip.mp4" --duration 60
```

Use `--gpu-validation on|off` to compare per-frame WebGPU error scopes, `--gpu-fused-apply on|off` to compare the hierarchical fused kernel with the original dispatch sequence, and `--hud on|off` to compare HUD cost. Fused apply, validation and HUD default to `on`, matching the experimental app path. For a controlled validation comparison, keep the fused kernel and HUD unchanged:

```powershell
node scripts/benchmark-app-gpu.mjs --gpu-validation on --gpu-fused-apply on --hud on
node scripts/benchmark-app-gpu.mjs --gpu-validation off --gpu-fused-apply on --hud on
```

The legacy kernel can be compared with `--gpu-fused-apply off`. Each run report records all three switches so the comparison can be audited. Turning off per-frame scopes leaves the startup GPU fidelity checks enabled; use the browser error log and report fidelity fields to reject a run with GPU errors or drift. The current matched A/B evidence and its limits are in [FUSED-DISPATCH-2026-10-13.md](FUSED-DISPATCH-2026-10-13.md).

Use `--headed` to watch Chrome, or `--output-dir "D:\\reports"` to choose a report folder. The runner verifies that the report's video SHA-256 and build revision match the selected input and current checkout, and prints the primary timing and fidelity fields. It does not claim that a run meets the 30 fps acceptance target; evaluate `processedFps`, frame-path latency, and missed presented callbacks over the full requested duration.
