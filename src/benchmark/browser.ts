import { SonificationPipeline } from '../engine/pipeline.ts';
import type { SonificationPreset } from '../types/index.ts';
import { FILTER_DESCRIPTORS, createFilterInstance } from '../engine/filters/factory.ts';
import { TapeWowFilter } from '../engine/filters/lofi/tapewow.ts';
import { FixtureRandom } from '../engine/fixtures/random.ts';
import { WasmDspRuntime } from '../engine/backends/wasm.ts';
import { summarize } from './report.ts';

declare const __BENCHMARK_BUILD__: { revision: string; dirty: boolean };

const element = <T extends HTMLElement>(id: string): T => {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing benchmark element: ${id}`);
  return value as T;
};
const source = element<HTMLInputElement>('source');
const presetSelect = element<HTMLSelectElement>('preset');
const backendSelect = element<HTMLSelectElement>('backend');
const fpsSelect = element<HTMLSelectElement>('fps');
const durationInput = element<HTMLInputElement>('duration');
const profileInput = element<HTMLInputElement>('profile');
const runButton = element<HTMLButtonElement>('run');
const stopButton = element<HTMLButtonElement>('stop');
const downloadButton = element<HTMLButtonElement>('download');
const status = element<HTMLParagraphElement>('status');
const reportElement = element<HTMLPreElement>('report');
const video = element<HTMLVideoElement>('video');
const output = element<HTMLCanvasElement>('output');
const outputContext = output.getContext('2d');
const capture = document.createElement('canvas');
capture.width = output.width; capture.height = output.height;
const captureContext = capture.getContext('2d', { willReadFrequently: true });
if (!outputContext || !captureContext) throw new Error('2D canvas unavailable');
const displayContext = outputContext;
const readContext = captureContext;
let sourceUrl: string | undefined;
let sourceInfo: { name: string; bytes: number; sha256: string } | undefined;
let generation = 0;
let callbackId: number | undefined;
let running = false;
let lastReport: Record<string, unknown> | undefined;
let releaseRun: (() => void) | undefined;
let releaseSourceLoad: (() => void) | undefined;

function setRunning(value: boolean): void {
  running = value;
  runButton.disabled = value || !sourceInfo;
  stopButton.disabled = !value;
  source.disabled = value; presetSelect.disabled = value; fpsSelect.disabled = value;
  backendSelect.disabled = value;
  durationInput.disabled = value; profileInput.disabled = value;
}
function stop(): void {
  generation++;
  releaseRun?.(); releaseRun = undefined;
  if (callbackId !== undefined) video.cancelVideoFrameCallback(callbackId);
  callbackId = undefined;
  video.pause();
  setRunning(false);
}
source.addEventListener('change', async () => {
  stop();
  releaseSourceLoad?.(); releaseSourceLoad = undefined;
  const currentGeneration = generation;
  sourceInfo = undefined; lastReport = undefined; downloadButton.disabled = true;
  reportElement.textContent = ''; runButton.disabled = true;
  if (sourceUrl) { URL.revokeObjectURL(sourceUrl); sourceUrl = undefined; }
  const file = source.files?.[0];
  if (!file) { video.removeAttribute('src'); video.load(); return; }
  try {
    status.textContent = 'Hashing source and loading video…';
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    if (currentGeneration !== generation) return;
    sourceUrl = URL.createObjectURL(file);
    video.src = sourceUrl;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener('loadeddata', loaded); video.removeEventListener('error', failed);
        releaseSourceLoad = undefined;
      };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error('Video failed to load')); };
      const timeout = setTimeout(failed, 15_000);
      releaseSourceLoad = () => { cleanup(); reject(new Error('Source load cancelled')); };
      video.addEventListener('loadeddata', loaded, { once: true });
      video.addEventListener('error', failed, { once: true });
      video.load();
    });
    if (currentGeneration !== generation) return;
    sourceInfo = { name: file.name, bytes: file.size, sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    status.textContent = `Loaded ${video.videoWidth}×${video.videoHeight}; processing will use 1280×720. Source cadence must be independently known.`;
    runButton.disabled = false;
  } catch (error) { if (currentGeneration === generation) status.textContent = String(error); }
});

function makePreset(): SonificationPreset {
  const stream = { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' } as const;
  const types = presetSelect.value === 'tape' ? ['tapesat', 'tapewow'] as const :
    presetSelect.value === 'tapesat' ? ['tapesat'] as const :
    presetSelect.value === 'tapewow' ? ['tapewow'] as const :
    presetSelect.value === 'moog' ? ['moogladder'] as const : [];
  return { id: `benchmark-${presetSelect.value}`, name: `Benchmark ${presetSelect.value}`,
    reader: { ...stream }, writer: { ...stream }, equalize: false, blendMode: 'NONE', blendAmount: 0,
    filters: types.map(type => ({ id: type, type, enabled: true, sampleRate: 44100,
      params: Object.fromEntries(FILTER_DESCRIPTORS[type].params.map(param => [param.name, param.value])) })),
    videoFilters: [],
  };
}

runButton.addEventListener('click', async () => {
  if (running || !sourceInfo) return;
  if (typeof video.requestVideoFrameCallback !== 'function') { status.textContent = 'This harness requires requestVideoFrameCallback.'; return; }
  const durationSeconds = Number(durationInput.value);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 300) { status.textContent = 'Measure duration must be 1–300 seconds.'; return; }
  stop(); setRunning(true);
  lastReport = undefined; downloadButton.disabled = true; reportElement.textContent = '';
  const currentGeneration = generation;
  const preset = makePreset(), targetFps = Number(fpsSelect.value), profile = profileInput.checked;
  const backend = backendSelect.value;
  let runtime: WasmDspRuntime | undefined;
  if (backend === 'wasm-scalar' || backend === 'wasm-simd') {
    try {
      status.textContent = `Loading ${backend} prototype…`;
      runtime = await WasmDspRuntime.load(`/wasm/dsp-${backend === 'wasm-simd' ? 'simd' : 'scalar'}.wasm`);
      if (currentGeneration !== generation) { runtime.dispose(); return; }
    } catch (error) {
      if (currentGeneration === generation) { stop(); status.textContent = `WASM unavailable: ${String(error)}`; }
      return;
    }
  }
  const pipeline = runtime ? new SonificationPipeline(runtime.createFilter, runtime.processSegment) :
    new SonificationPipeline((type, rate) => type === 'tapewow' ? new TapeWowFilter(rate, new FixtureRandom(4821).next) : createFilterInstance(type, rate));
  const outputImage = displayContext.createImageData(1280, 720);
  const samples: Record<string, number[]> = { captureMs: [], pipelineMs: [], outputSubmitMs: [], completeCpuPathMs: [], callbackIntervalMs: [] };
  let warmupStart: number | undefined, measurementStart: number | undefined;
  let previousCallback: number | undefined, previousPresented: number | undefined;
  let skippedCallbacks = 0, measuredFrames = 0;
  let lastFrameAt = performance.now();
  let longTaskCount = 0, longTaskDurationMs = 0;
  const observer = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask') ? new PerformanceObserver(list => {
    if (measurementStart !== undefined) for (const entry of list.getEntries()) {
      if (entry.startTime >= measurementStart) { longTaskCount++; longTaskDurationMs += entry.duration; }
    }
  }) : undefined;
  observer?.observe({ entryTypes: ['longtask'] });
  const finish = (elapsedMs: number, error?: unknown) => {
    observer?.disconnect();
    if (currentGeneration !== generation) return;
    stop();
    if (error) { status.textContent = `Benchmark failed: ${String(error)}`; return; }
    lastReport = {
      schemaVersion: 1, runId: crypto.randomUUID(), createdAt: new Date().toISOString(),
      build: __BENCHMARK_BUILD__,
      scope: 'reference-canvas-path; excludes live audio, HUD, recording and physical display confirmation',
      backend, wasmBuild: runtime?.buildInfo ?? null, profileEnabled: profile, source: sourceInfo, decodedWidth: video.videoWidth, decodedHeight: video.videoHeight,
      randomControl: { algorithm: 'fixture-xorshift32', seed: 4821, productionPolicyUnchanged: true },
      processedWidth: 1280, processedHeight: 720, targetFps, preset,
      warmupSeconds: 10, measuredSeconds: elapsedMs / 1000, measuredFrames,
      processedFps: measuredFrames / (elapsedMs / 1000), skippedPresentedCallbacks: skippedCallbacks,
      droppedFrameAttribution: 'presentedFrames gaps show missed processing callbacks; decode drops are not observable here',
      longTasks: observer ? { count: longTaskCount, durationMs: longTaskDurationMs } : null,
      timings: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, summarize(values)])),
      environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, devicePixelRatio },
      acceptance: 'not evaluated: full application and named physical device gates remain required',
    };
    reportElement.textContent = JSON.stringify(lastReport, null, 2);
    downloadButton.disabled = false;
    status.textContent = 'Reference run complete. Download the report and record revision/device/power conditions alongside it.';
  };
  const frame: VideoFrameRequestCallback = (now, metadata) => {
    callbackId = undefined;
    if (currentGeneration !== generation) { observer?.disconnect(); return; }
    try {
      lastFrameAt = performance.now();
      warmupStart ??= now;
      if (measurementStart === undefined && now - warmupStart >= 10_000) measurementStart = now;
      const measuring = measurementStart !== undefined;
      const start = performance.now();
      readContext.drawImage(video, 0, 0, 1280, 720);
      const rgba = readContext.getImageData(0, 0, 1280, 720);
      const captured = performance.now();
      const result = pipeline.processFrame(rgba.data, 1280, 720, preset, outputImage.data, { profile });
      const processed = performance.now();
      displayContext.putImageData(outputImage, 0, 0);
      const completed = performance.now();
      if (measuring) {
        measuredFrames++;
        samples.captureMs.push(captured - start); samples.pipelineMs.push(processed - captured);
        samples.outputSubmitMs.push(completed - processed); samples.completeCpuPathMs.push(completed - start);
        if (previousCallback !== undefined) samples.callbackIntervalMs.push(now - previousCallback);
        if (previousPresented !== undefined) skippedCallbacks += Math.max(0, metadata.presentedFrames - previousPresented - 1);
        if (result.timings) for (const [name, value] of Object.entries(result.timings)) (samples[name] ??= []).push(value);
        previousCallback = now; previousPresented = metadata.presentedFrames;
        const elapsedMs = completed - measurementStart!;
        if (elapsedMs >= durationSeconds * 1000) { finish(elapsedMs); return; }
      }
      status.textContent = measuring ? `Measuring: ${measuredFrames} frames` : 'Warming up for 10 seconds…';
      callbackId = video.requestVideoFrameCallback(frame);
    } catch (error) { finish(0, error); }
  };
  const watchdog = setInterval(() => {
    if (currentGeneration === generation && performance.now() - lastFrameAt > 5000) finish(0, 'Source stopped delivering video callbacks');
  }, 500);
  releaseRun = () => { observer?.disconnect(); clearInterval(watchdog); runtime?.dispose(); };
  try {
    await video.play();
    if (currentGeneration !== generation) { observer?.disconnect(); return; }
    callbackId = video.requestVideoFrameCallback(frame);
  } catch (error) { finish(0, error); }
});
stopButton.addEventListener('click', () => { stop(); status.textContent = 'Run cancelled; no completed report generated.'; });
downloadButton.addEventListener('click', () => {
  if (!lastReport) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `benchmark-${lastReport.runId}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', () => { stop(); releaseSourceLoad?.(); if (sourceUrl) URL.revokeObjectURL(sourceUrl); });
