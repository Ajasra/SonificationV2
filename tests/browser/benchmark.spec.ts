import { test, expect } from '@playwright/test';

test('reference video benchmark completes and exports an attributed report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/benchmark.html');
  await expect(page.locator('#fps')).toHaveValue('30');
  // Generate a local smoke fixture in-browser; this tests real decoding and
  // callbacks, not physical camera fidelity or a performance acceptance target.
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    let frame = 0;
    const timer = setInterval(() => {
      ctx.fillStyle = `rgb(${frame++ % 255},80,160)`; ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = 'white'; ctx.fillRect((frame * 15) % 1280, 0, 100, 720);
    }, 33);
    recorder.start(); await new Promise(resolve => setTimeout(resolve, 1200));
    recorder.stop(); await stopped; clearInterval(timer); stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  await page.locator('#source').setInputFiles({ name: 'synthetic-smoke-720p30.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) });
  await expect(page.locator('#run')).toBeEnabled();
  // Exercise the real video lifecycle even on machines without a GPU adapter.
  const snapshot=await page.evaluate(async()=>{
    const {snapshotVideoFrame}=await import('/src/benchmark/video-snapshot.ts');
    const video=document.querySelector<HTMLVideoElement>('#video')!;
    const bitmap=await snapshotVideoFrame(video,new AbortController().signal);
    try{return {width:bitmap.width,height:bitmap.height,paused:video.paused};}finally{bitmap.close();}
  });
  expect(snapshot).toEqual({width:1280,height:720,paused:true});
  await page.locator('#duration').fill('0');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('1–300 seconds');
  await expect(page.locator('#stop')).toBeDisabled();
  await page.locator('#duration').fill('1');
  await page.locator('#fps').selectOption('30');
  await page.locator('#run').click();
  await expect(page.locator('#report')).toContainText('"schemaVersion": 1', { timeout: 30_000 });
  const report = JSON.parse(await page.locator('#report').textContent() || '{}');
  expect(report.decodedWidth).toBe(1280); expect(report.decodedHeight).toBe(720);
  expect(report.measuredFrames).toBeGreaterThan(0);
  expect(report.targetFps).toBe(30);
  expect(report.measuredSeconds).toBeGreaterThanOrEqual(1);
  expect(report.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.build.revision).toMatch(/^[a-f0-9]{40}$/);
  expect(report.timings.completeCpuPathMs.p95).toBeGreaterThan(0);
  expect(report.timings.setupMs.count).toBe(report.measuredFrames);
  expect(report.acceptance).toContain('not evaluated');
  await test.info().attach('reference-smoke-report', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
  const downloading = page.waitForEvent('download');
  await page.locator('#download').click();
  expect((await downloading).suggestedFilename()).toBe(`benchmark-${report.runId}.json`);
  // Starting and cancelling a second run invalidates the completed report.
  await page.locator('#run').click(); await page.locator('#stop').click();
  await expect(page.locator('#run')).toBeEnabled();
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#report')).toBeEmpty();
  // Unsupported GPU racks must produce diagnostics without touching an adapter.
  await page.locator('#backend').selectOption('webgpu-resident');
  await page.locator('#preset').selectOption('control');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('supports TapeSat only');
  await expect(page.locator('#run')).toBeEnabled();
  await expect(page.locator('#download')).toBeEnabled();
  const gpuFailure=JSON.parse(await page.locator('#report').textContent() || '{}');
  expect(gpuFailure.backend).toBe('webgpu-resident');
  expect(gpuFailure.acceptance).toContain('performance run blocked');
  await page.locator('#backend').selectOption('wasm-scalar');
  await page.locator('#preset').selectOption('tape');
  await page.locator('#run').click();
  await expect(page.locator('#report')).toContainText('"backend": "wasm-scalar"', { timeout: 30_000 });
  const wasmReport = JSON.parse(await page.locator('#report').textContent() || '{}');
  expect(wasmReport.randomControl.algorithm).toBe('fixture-xorshift32');
  expect(wasmReport.wasmBuild.emscripten).toBe('6.0.12');
  await test.info().attach('wasm-smoke-report', { body: JSON.stringify(wasmReport, null, 2), contentType: 'application/json' });
  await page.route('**/dsp-scalar.wasm', route => route.abort());
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('WASM unavailable');
  await expect(page.locator('#run')).toBeEnabled();
  await expect(page.locator('#stop')).toBeDisabled();
  await expect(page.locator('#download')).toBeDisabled();
});

test('WASM browser pipelines preserve pixels and samples for supported filters', async ({ page }) => {
  await page.goto('/benchmark.html');
  const errors = await page.evaluate(async () => {
    const { WasmDspRuntime } = await import('/src/engine/backends/wasm.ts');
    const { SonificationPipeline } = await import('/src/engine/pipeline.ts');
    const { createFilterInstance, FILTER_DESCRIPTORS } = await import('/src/engine/filters/factory.ts');
    const { TapeWowFilter } = await import('/src/engine/filters/lofi/tapewow.ts');
    const { FixtureRandom } = await import('/src/engine/fixtures/random.ts');
    const results = [];
    for (const variant of ['scalar', 'simd']) for (const types of [['tapesat'], ['tapewow'], ['tapesat', 'tapewow'], ['moogladder']]) {
      const runtime = await WasmDspRuntime.load(`/wasm/dsp-${variant}.wasm`);
      try {
        const reference = new SonificationPipeline((type: string, rate: number) => type === 'tapewow' ? new TapeWowFilter(rate, new FixtureRandom(4821).next) : createFilterInstance(type, rate));
        const candidate = new SonificationPipeline(runtime.createFilter, runtime.processSegment);
        const stream = { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' };
        const preset = { id: 'conformance', name: 'conformance', reader: stream, writer: stream,
          equalize: false, blendMode: 'NONE', blendAmount: 0, videoFilters: [],
          filters: types.map(type => ({ id: type, type, enabled: true, sampleRate: 44100,
            params: Object.fromEntries(FILTER_DESCRIPTORS[type].params.map((p: { name: string; value: number }) => [p.name, p.value])) })),
        };
        let sampleMax = 0, pixelMax = 0;
        for (let frame = 0; frame < 8; frame++) {
          const input = new Uint8ClampedArray(65 * 47 * 4);
          for (let i = 0; i < input.length; i++) input[i] = (i * 37 + frame * 13) % 256;
          const js = reference.processFrame(input, 65, 47, preset, undefined, { timeMs: 1234 });
          const wasm = candidate.processFrame(input, 65, 47, preset, undefined, { timeMs: 1234 });
          for (let i = 0; i < input.length; i++) pixelMax = Math.max(pixelMax, Math.abs(js.outputRgba[i] - wasm.outputRgba[i]));
          for (let i = 0; i < js.audioSamples.length; i++) sampleMax = Math.max(sampleMax, Math.abs(js.audioSamples[i] - wasm.audioSamples[i]));
        }
        results.push({ variant, types, sampleMax, pixelMax });
      } finally { runtime.dispose(); }
    }
    return results;
  });
  for (const result of errors) { expect(result.sampleMax, result.types.join('+')).toBeLessThanOrEqual(1e-6); expect(result.pixelMax, result.types.join('+')).toBe(0); }
  await test.info().attach('browser-fidelity', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
});

test('benchmark starts with controls disabled until a video is loaded', async ({ page }) => {
  await page.goto('/benchmark.html');
  await expect(page.locator('#run')).toBeDisabled();
  await expect(page.locator('#stop')).toBeDisabled();
  await expect(page.locator('#download')).toBeDisabled();
});
