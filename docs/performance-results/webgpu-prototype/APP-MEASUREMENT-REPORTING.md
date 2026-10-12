# Application performance report fields

The experimental GPU FPS badge now displays the rounded current FPS, latest complete-frame path latency, backend, elapsed session seconds and collected measurement seconds. Click or keyboard-activate it to download the cumulative report.

The report retains completed-frame timing samples when settings or frame loops reset measurement warmup. `measurementResets` records elapsed session time and the reset reason. Each new settings/source segment receives the existing 10-second warmup. `sessionSeconds` covers elapsed time from the first processed frame; `measuredSeconds` sums the post-warmup windows, excluding pauses and warmups. `processedFps` is collected frames divided by measured wall time, so it includes scheduling gaps inside each measured window.

Per-frame timing percentiles include capture (`drawImage` and `getImageData`), preparation between capture and GPU submission, GPU processing through completion/readback, audio submission, telemetry update, and the remainder of complete-frame work. HUD canvas rendering is measured independently in its own RAF and competes for device time; it is not included in the synchronous frame-path stages. HUD timing starts with the first app processing session and is capped to the most recent 10,000 renders.

Use `framePathMs`, `processedFps` and `missedPresentedCallbacks` for the existing gates. Stage timings locate likely costs; they can overlap with browser scheduling and GPU execution, so do not sum their percentiles. The report does not identify dropped decoder frames or confirm physical display presentation/audio output.
