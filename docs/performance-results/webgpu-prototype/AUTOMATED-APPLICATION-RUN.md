# Automated application GPU run

From the repository root, run:

```powershell
npm run benchmark:app-gpu
```

The runner uses the recent source video on the Desktop by default. It starts a temporary loopback Vite server, opens Chrome with WebGPU enabled, selects the 720p GPU path, enables the audio context at zero volume, loads the video, waits for the requested measured time, downloads the JSON benchmark report to `Downloads`, and stops the browser and server.

The default measured time is 60 seconds, in addition to the application's warmup. To shorten a diagnostic run or choose another file:

```powershell
npm run benchmark:app-gpu -- --duration 10
npm run benchmark:app-gpu -- --video "D:\\media\\clip.mp4" --duration 60
```

Use `--headed` to watch Chrome, or `--output-dir "D:\\reports"` to choose a report folder. The runner verifies that the report's video SHA-256 and build revision match the selected input and current checkout, and prints the primary timing and fidelity fields. It does not claim that a run meets the 30 fps acceptance target; evaluate `processedFps`, frame-path latency, and missed presented callbacks over the full requested duration.
