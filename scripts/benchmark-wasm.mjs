import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const port = 5177;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.benchmark.config.ts', '--port', String(port)], {
  stdio: 'ignore', windowsHide: true,
});
let startupError;
server.on('error', error => { startupError = error; });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error('Benchmark server exited before readiness');
    try { ready = (await fetch(`http://127.0.0.1:${port}/benchmark.html`)).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Benchmark server did not become ready');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/benchmark.html`);
  const results = await page.evaluate(async () => {
    const { WasmDspRuntime } = await import('/src/engine/backends/wasm.ts');
    const { SonificationPipeline } = await import('/src/engine/pipeline.ts');
    const { createFilterInstance, FILTER_DESCRIPTORS } = await import('/src/engine/filters/factory.ts');
    const { TapeWowFilter } = await import('/src/engine/filters/lofi/tapewow.ts');
    const { FixtureRandom } = await import('/src/engine/fixtures/random.ts');
    const { summarize } = await import('/src/benchmark/report.ts');
    const source = document.createElement('canvas'), capture = document.createElement('canvas'), output = document.createElement('canvas');
    for (const canvas of [source, capture, output]) { canvas.width = 1280; canvas.height = 720; }
    const sourceCtx = source.getContext('2d'), captureCtx = capture.getContext('2d', { willReadFrequently: true }), outputCtx = output.getContext('2d');
    const image = sourceCtx.createImageData(1280, 720);
    for (let i = 0; i < image.data.length; i++) image.data[i] = i % 4 === 3 ? 255 : (i * 37) % 256;
    sourceCtx.putImageData(image, 0, 0);
    const stream = { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' };
    const cases = [];
    for (const types of [['tapesat'], ['tapewow'], ['tapesat', 'tapewow'], ['moogladder'], ['shiftr']]) {
      const preset = { id: types.join('+'), name: types.join('+'), reader: stream, writer: stream,
        equalize: false, blendMode: 'NONE', blendAmount: 0, videoFilters: [],
        filters: types.map(type => ({ id: type, type, enabled: true, sampleRate: 44100,
          params: Object.fromEntries(FILTER_DESCRIPTORS[type].params.map(p => [p.name, p.value])) })),
      };
      for (const backend of ['js', 'wasm-scalar', 'wasm-scalar-arena', 'wasm-simd']) {
        const runtime = backend === 'js' ? undefined : await WasmDspRuntime.load(`/wasm/dsp-${backend === 'wasm-simd' ? 'simd' : 'scalar'}.wasm`);
        try {
          const pipeline = runtime ? new SonificationPipeline(runtime.createFilter, runtime.processSegment,
            backend === 'wasm-scalar-arena' ? runtime.getSampleBuffer : undefined) :
            new SonificationPipeline((type, rate) => type === 'tapewow' ? new TapeWowFilter(rate, new FixtureRandom(4821).next) : createFilterInstance(type, rate));
          const target = outputCtx.createImageData(1280, 720);
          const samples = { drawMs: [], readbackMs: [], pipelineMs: [], dspMs: [], outputSubmitMs: [], completeCpuPathMs: [] };
          const warmupFrames = types.includes('shiftr') ? 2 : 5;
          const measuredFrames = types.includes('shiftr') ? 5 : 20;
          for (let frame = 0; frame < warmupFrames + measuredFrames; frame++) {
            const start = performance.now(); captureCtx.drawImage(source, 0, 0);
            const drawn = performance.now(), input = captureCtx.getImageData(0, 0, 1280, 720), read = performance.now();
            const result = pipeline.processFrame(input.data, 1280, 720, preset, target.data, { profile: true, timeMs: frame * 1000 / 30 });
            const processed = performance.now(); outputCtx.putImageData(target, 0, 0); const end = performance.now();
            if (frame >= warmupFrames) {
              samples.drawMs.push(drawn - start); samples.readbackMs.push(read - drawn);
              samples.pipelineMs.push(processed - read); samples.dspMs.push(result.timings.audioDspMs);
              samples.outputSubmitMs.push(end - processed); samples.completeCpuPathMs.push(end - start);
            }
          }
          cases.push({ backend, preset, warmupFrames, measuredFrames, wasmBuild: runtime?.buildInfo ?? null,
            timings: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, summarize(values)])) });
        } finally { runtime?.dispose(); }
      }
    }
    return { environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency }, cases };
  });
  const runId = randomUUID();
  const report = { schemaVersion: 1, runId, createdAt: new Date().toISOString(), browserVersion: browser.version(),
    build: { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0 },
    scope: 'headless synthetic 720p canvas CPU path; excludes video decoding, monitoring, HUD and display confirmation',
    warmupFrames: 5, measuredFrames: 20, width: 1280, height: 720,
    fixture: { pattern: 'RGBA byte i: alpha=255, RGB=(i*37)%256', randomAlgorithm: 'xorshift32', seed: 4821 },
    acceptance: 'not evaluated; exploratory comparison only', ...results };
  const directory = 'docs/performance-results/wasm-prototype'; fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, `synthetic-${runId}.json`);
  fs.writeFileSync(filename, JSON.stringify(report, null, 2) + '\n');
  console.log(filename);
  for (const item of results.cases) console.log(`${item.preset.name} ${item.backend}: DSP p95=${item.timings.dspMs.p95.toFixed(2)}ms; path p95=${item.timings.completeCpuPathMs.p95.toFixed(2)}ms`);
} finally {
  await browser?.close(); server.kill();
}
