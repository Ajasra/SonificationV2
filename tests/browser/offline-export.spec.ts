import { test, expect } from '@playwright/test';

test('offline MP4 export uses isolated DSP history and returns a finalized MP4', async ({ page }) => {
  await page.goto('/benchmark.html');
  const supported = await page.evaluate(async () => {
    if (typeof VideoEncoder === 'undefined') return false;
    const result = await VideoEncoder.isConfigSupported({
      codec: 'avc1.42001f', width: 64, height: 48, bitrate: 250_000, framerate: 5,
    });
    return result.supported;
  });
  test.skip(!supported, 'This browser has no supported AVC WebCodecs encoder.');

  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    const context = canvas.getContext('2d')!;
    const media = canvas.captureStream(30);
    const chunks: Blob[] = [];
    const sourceRecorder = new MediaRecorder(media, { mimeType: 'video/webm;codecs=vp8' });
    sourceRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise<void>(resolve => { sourceRecorder.onstop = () => resolve(); });
    let frame = 0;
    const draw = setInterval(() => {
      context.fillStyle = `rgb(${(frame * 19) % 256},${(frame * 31) % 256},${(frame * 47) % 256})`;
      context.fillRect(0, 0, 64, 48);
      context.fillStyle = 'white';
      context.fillRect(frame % 64, 0, 8, 48);
      frame++;
    }, 33);
    sourceRecorder.start();
    await new Promise(resolve => setTimeout(resolve, 1400));
    sourceRecorder.stop(); await stopped; clearInterval(draw);
    media.getTracks().forEach(track => track.stop());

    const video = document.createElement('video');
    video.muted = true; video.preload = 'auto';
    video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    document.body.append(video);
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Generated WebM failed to load'));
    });
    await video.play(); await new Promise(resolve => setTimeout(resolve, 40)); video.pause();

    const { SonificationPipeline } = await import('/src/engine/pipeline.ts');
    const { OfflineVideoRecorder } = await import('/src/record/offline-video-recorder.ts');
    const stream = { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' };
    const preset = {
      id: 'offline-isolation', name: 'offline-isolation', reader: stream, writer: stream,
      filters: [{ id: 'sat', type: 'tapesat', enabled: true, sampleRate: 44100, params: { drive: 2.5, bias: .1, bump: .4, bumpHz: 80, tone: 8000 } }],
      videoFilters: [], equalize: false, blendMode: 'NONE', blendAmount: 0,
    } as const;
    const live = new SonificationPipeline();
    const initial = new Uint8ClampedArray(64 * 48 * 4);
    for (let i = 0; i < initial.length; i++) initial[i] = (i * 13) % 256;
    live.processFrame(initial, 64, 48, preset as never, undefined, { timeMs: 100 });
    const before = JSON.stringify(live.tapeSatState(preset as never, 64, 48, 'sat'));
    let exportPipeline: InstanceType<typeof SonificationPipeline> | undefined;
    let completed = 0;
    const recorder = new OfflineVideoRecorder();
    const output = await recorder.render({
      video, canvas, pipelineFactory: () => (exportPipeline = new SonificationPipeline()),
      activePreset: preset as never, targetFps: 5, audioSampleRate: 44100,
      startTime: 0, endTime: Math.min(video.duration, 1),
      onProgress: progress => { completed = progress.currentFrame; },
    });
    const after = JSON.stringify(live.tapeSatState(preset as never, 64, 48, 'sat'));
    const liveHistoryPreserved = before === after;
    const exportState = exportPipeline && JSON.stringify(exportPipeline.tapeSatState(preset as never, 64, 48, 'sat'));
    const file = output && new Uint8Array(await output.blob.arrayBuffer());
    const firstBox = file && String.fromCharCode(...file.slice(4, 8));
    URL.revokeObjectURL(video.src); video.remove();
    return {
      support: true, outputExt: output?.ext ?? null, outputType: output?.blob.type ?? null,
      outputBytes: output?.blob.size ?? 0, firstBox, completed,
      liveHistoryPreserved, isolatedPipelineAdvanced: Boolean(exportState && exportState !== before),
      runningAfter: recorder.getIsRunning(), sourceRestored: Math.abs(video.currentTime) < .05,
    };
  });

  expect(result.outputExt).toBe('mp4');
  expect(result.outputType).toBe('video/mp4');
  expect(result.outputBytes).toBeGreaterThan(500);
  expect(result.firstBox).toBe('ftyp');
  expect(result.completed).toBeGreaterThan(0);
  expect(result.liveHistoryPreserved).toBe(true);
  expect(result.isolatedPipelineAdvanced).toBe(true);
  expect(result.runningAfter).toBe(false);
  expect(result.sourceRestored).toBe(true);
  await test.info().attach('offline-export-smoke.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});
