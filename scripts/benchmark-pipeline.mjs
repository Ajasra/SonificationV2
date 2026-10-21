// Performance & Quality Benchmark for Sonification Pipeline and Video Filters
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const nativeRequire = createRequire(import.meta.url);

function load(file, globals = {}) {
  const filename = path.resolve(file);
  let source = fs.readFileSync(filename, 'utf8');
  if (file.endsWith('main.ts')) source = source.replace('class SonopticonApp', 'export class SonopticonApp').replace('class SonificationApp', 'export class SonificationApp');
  source = source.replace(/import\.meta/g, '({ env: {} })');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    console: { warn() {}, error() {} },
    performance,
    DOMException,
    setTimeout,
    clearTimeout,
    require: (name) =>
      name.endsWith('.ts') ? load(path.resolve(path.dirname(filename), name), globals) : nativeRequire(name),
    ...globals,
  }, { filename });
  return exports;
}

const { SonificationPipeline } = load('src/engine/pipeline.ts');
const { FACTORY_PRESETS } = load('src/presets/factory-presets.ts');
const { VIDEO_FILTER_DESCRIPTORS, createVideoFilterInstance } = load('src/engine/video-filters/factory.ts');
const { FILTER_DESCRIPTORS } = load('src/engine/filters/factory.ts');

const defaultParams = (desc) => Object.fromEntries(desc.params.map((p) => [p.name, p.value]));

// Synthetic test image: realistic gradient + high-frequency details
function createTestImage(w, h) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      buf[idx] = (Math.sin(x * 0.05) * 127 + 128) | 0;         // R
      buf[idx + 1] = (Math.cos(y * 0.05) * 127 + 128) | 0;     // G
      buf[idx + 2] = ((x * 13 + y * 29) % 256);                 // B
      buf[idx + 3] = 255;                                       // A
    }
  }
  return buf;
}

// Checksum to verify numerical output preservation
function computeMetrics(buf) {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    sum += v;
    sumSq += v * v;
  }
  return { mean: sum / buf.length, rms: Math.sqrt(sumSq / buf.length) };
}

function benchmarkFunction(name, fn, iterations = 30, warmup = 5) {
  for (let i = 0; i < warmup; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const t1 = performance.now();
  const totalMs = t1 - t0;
  const avgMs = totalMs / iterations;
  const fps = 1000 / avgMs;
  return { name, avgMs, fps };
}

console.log('='.repeat(70));
console.log(' SONIFICATION PIPELINE & FILTERS BENCHMARK');
console.log('='.repeat(70));

const W_480 = 640;
const H_480 = 480;
const img480 = createTestImage(W_480, H_480);
const out480 = new Uint8ClampedArray(W_480 * H_480 * 4);

// 1. Standalone Video Filters Benchmark at 480p (640x480)
console.log('\n--- 1. Individual Video Filters (640x480, 30 frames) ---');
const videoFilterTypes = ['procamp', 'colorizer', 'cvislicer', 'solarizer', 'rftuner', 'syncglitch', 'vidicon', 'crtbloom', 'ruttetra', 'chromasmear', 'framedelay'];
const videoResults = [];

for (const type of videoFilterTypes) {
  const desc = VIDEO_FILTER_DESCRIPTORS[type];
  if (!desc) continue;
  const inst = createVideoFilterInstance(type);
  inst.init(W_480, H_480);
  inst.setParams(defaultParams(desc));

  const ctx = { width: W_480, height: H_480, timeMs: 1000, audioRms: 0.25, audioPeak: 0.5 };
  const workingRgba = new Uint8ClampedArray(img480);

  const res = benchmarkFunction(type, () => {
    workingRgba.set(img480);
    inst.processFrame(workingRgba, ctx);
  }, 25, 5);

  const metrics = computeMetrics(workingRgba);
  videoResults.push({ ...res, metrics });
  console.log(`  * ${type.padEnd(14)}: ${res.avgMs.toFixed(2)} ms/frame  (${res.fps.toFixed(1)} FPS)  [RMS: ${metrics.rms.toFixed(2)}]`);
}

// 2. Audio Pipeline Microbenchmarks (921,600 samples)
console.log('\n--- 2. Audio Pipeline Microbenchmarks (921,600 samples) ---');
const { imageToAudioStream, audioStreamToImage } = load('src/engine/streams.ts');
const { createFilterInstance } = load('src/engine/filters/factory.ts');
const streamCfg = { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' };

const numSamples = (W_480 * H_480 * 3);
const audioBuffer = new Float32Array(numSamples);
const testAudioOut = new Uint8ClampedArray(W_480 * H_480 * 4);

const benchStreamEnc = benchmarkFunction('imageToAudioStream', () => {
  imageToAudioStream(img480, streamCfg, audioBuffer);
}, 25, 5);
console.log(`  * ${benchStreamEnc.name.padEnd(20)}: ${benchStreamEnc.avgMs.toFixed(2)} ms/frame  (${benchStreamEnc.fps.toFixed(1)} FPS)`);

const benchStreamDec = benchmarkFunction('audioStreamToImage', () => {
  audioStreamToImage(audioBuffer, streamCfg, testAudioOut);
}, 25, 5);
console.log(`  * ${benchStreamDec.name.padEnd(20)}: ${benchStreamDec.avgMs.toFixed(2)} ms/frame  (${benchStreamDec.fps.toFixed(1)} FPS)`);

for (const aType of ['moogladder', 'wavefolder', 'echo', 'tapesat', 'tapewow']) {
  const inst = createFilterInstance(aType, 44100);
  inst.setParams(defaultParams(FILTER_DESCRIPTORS[aType]));
  const testBlock = new Float32Array(audioBuffer);
  const benchA = benchmarkFunction(`DSP: ${aType}`, () => {
    inst.processBlock(testBlock);
  }, 20, 3);
  console.log(`  * ${benchA.name.padEnd(20)}: ${benchA.avgMs.toFixed(2)} ms/frame  (${benchA.fps.toFixed(1)} FPS)`);
}

console.log('\n--- 2b. P06 Pointwise candidate filters (921,600 samples) ---');
const pointwiseAudioResults = [];
for (const type of ['amplify', 'shiftr', 'wavefolder']) {
  const inst = createFilterInstance(type, 44100);
  inst.setParams(defaultParams(FILTER_DESCRIPTORS[type]));
  const block = new Float32Array(audioBuffer);
  const result = benchmarkFunction(`P06 ${type}`, () => {
    block.set(audioBuffer);
    inst.processBlock(block);
  }, 25, 5);
  pointwiseAudioResults.push(result);
  console.log(`  * ${result.name.padEnd(20)}: ${result.avgMs.toFixed(2)} ms/frame  (${result.fps.toFixed(1)} FPS)`);
}

// 3. Full Pipeline Scenarios
console.log('\n--- 3. Sonification Pipeline (Full Scenarios @ 640x480) ---');

// Scenario A: Heavy Audio DSP chain (3 audio filters: Moogladder, Wavefolder, Echo)
const audioChainPreset = {
  id: 'bench-audio',
  name: 'Audio DSP Chain',
  reader: streamCfg,
  writer: streamCfg,
  equalize: false,
  blendMode: 'NONE',
  blendAmount: 0,
  filters: [
    { id: 'a1', type: 'moogladder', enabled: true, sampleRate: 44100, params: defaultParams(FILTER_DESCRIPTORS.moogladder) },
    { id: 'a2', type: 'wavefolder', enabled: true, sampleRate: 44100, params: defaultParams(FILTER_DESCRIPTORS.wavefolder) },
    { id: 'a3', type: 'echo', enabled: true, sampleRate: 44100, params: defaultParams(FILTER_DESCRIPTORS.echo) },
  ],
  videoFilters: [],
  chain: [
    { kind: 'audio', id: 'a1' },
    { kind: 'audio', id: 'a2' },
    { kind: 'audio', id: 'a3' },
  ],
};

const pipeA = new SonificationPipeline();
const resA = benchmarkFunction('Pipeline: 3x Audio DSP', () => {
  pipeA.processFrame(img480, W_480, H_480, audioChainPreset, out480);
}, 20, 5);
console.log(`  * ${resA.name.padEnd(24)}: ${resA.avgMs.toFixed(2)} ms/frame  (${resA.fps.toFixed(1)} FPS)`);

const pointwisePreset = {
  id: 'bench-pointwise-audio', name: 'Amplify -> Shiftr -> Wavefolder', reader: streamCfg, writer: streamCfg,
  equalize: false, blendMode: 'NONE', blendAmount: 0, videoFilters: [],
  filters: ['amplify', 'shiftr', 'wavefolder'].map((type, index) => ({
    id: `p${index}`, type, enabled: true, sampleRate: 44100, params: defaultParams(FILTER_DESCRIPTORS[type]),
  })),
  chain: ['amplify', 'shiftr', 'wavefolder'].map((_, index) => ({ kind: 'audio', id: `p${index}` })),
};
const pointwisePipeline = new SonificationPipeline();
const pointwisePipelineResult = benchmarkFunction('Pipeline: P06 pointwise audio', () => {
  pointwisePipeline.processFrame(img480, W_480, H_480, pointwisePreset, out480);
}, 20, 5);
console.log(`  * ${pointwisePipelineResult.name.padEnd(28)}: ${pointwisePipelineResult.avgMs.toFixed(2)} ms/frame  (${pointwisePipelineResult.fps.toFixed(1)} FPS)`);

// Scenario B: Video Rack Chain (4 active video filters: procamp + colorizer + cvislicer + crtbloom)
const videoChainPreset = {
  id: 'bench-video',
  name: 'Video Rack 4x',
  reader: streamCfg,
  writer: streamCfg,
  equalize: false,
  blendMode: 'NONE',
  blendAmount: 0,
  filters: [],
  videoFilters: [
    { id: 'v1', type: 'procamp', enabled: true, params: defaultParams(VIDEO_FILTER_DESCRIPTORS.procamp) },
    { id: 'v2', type: 'colorizer', enabled: true, params: defaultParams(VIDEO_FILTER_DESCRIPTORS.colorizer) },
    { id: 'v3', type: 'cvislicer', enabled: true, params: defaultParams(VIDEO_FILTER_DESCRIPTORS.cvislicer) },
    { id: 'v4', type: 'crtbloom', enabled: true, params: defaultParams(VIDEO_FILTER_DESCRIPTORS.crtbloom) },
  ],
  chain: [
    { kind: 'video', id: 'v1' },
    { kind: 'video', id: 'v2' },
    { kind: 'video', id: 'v3' },
    { kind: 'video', id: 'v4' },
  ],
};

const pipeB = new SonificationPipeline();
const resB = benchmarkFunction('Pipeline: 4x Video Rack', () => {
  pipeB.processFrame(img480, W_480, H_480, videoChainPreset, out480);
}, 20, 5);
console.log(`  * ${resB.name.padEnd(24)}: ${resB.avgMs.toFixed(2)} ms/frame  (${resB.fps.toFixed(1)} FPS)`);

// Scenario C: Interleaved Video -> Audio -> Video
const interleavedPreset = {
  id: 'bench-interleaved',
  name: 'Interleaved V->A->V',
  reader: streamCfg,
  writer: streamCfg,
  equalize: false,
  blendMode: 'NONE',
  blendAmount: 0,
  filters: [
    { id: 'a1', type: 'moogladder', enabled: true, sampleRate: 44100, params: defaultParams(FILTER_DESCRIPTORS.moogladder) },
  ],
  videoFilters: [
    { id: 'v1', type: 'procamp', enabled: true, params: defaultParams(VIDEO_FILTER_DESCRIPTORS.procamp) },
    { id: 'v2', type: 'crtbloom', enabled: true, params: defaultParams(VIDEO_FILTER_DESCRIPTORS.crtbloom) },
  ],
  chain: [
    { kind: 'video', id: 'v1' },
    { kind: 'audio', id: 'a1' },
    { kind: 'video', id: 'v2' },
  ],
};

const pipeC = new SonificationPipeline();
const resC = benchmarkFunction('Pipeline: Interleaved V-A-V', () => {
  pipeC.processFrame(img480, W_480, H_480, interleavedPreset, out480);
}, 20, 5);
console.log(`  * ${resC.name.padEnd(24)}: ${resC.avgMs.toFixed(2)} ms/frame  (${resC.fps.toFixed(1)} FPS)`);

// Scenario D: User Preset: 480x852 Vertical Video + TapeSat + TapeWow
const W_USER = 480;
const H_USER = 852;
const imgUser = createTestImage(W_USER, H_USER);
const outUser = new Uint8ClampedArray(W_USER * H_USER * 4);

const userTapePreset = {
  id: 'bench-user-tape',
  name: 'User 480x852 TapeSat + TapeWow',
  reader: streamCfg,
  writer: streamCfg,
  equalize: false,
  blendMode: 'NONE',
  blendAmount: 0,
  filters: [
    { id: 'a1', type: 'tapesat', enabled: true, sampleRate: 44100, params: { drive: 2.2, bias: 0.08, bump: 0.35, bumpHz: 80, tone: 9500 } },
    { id: 'a2', type: 'tapewow', enabled: true, sampleRate: 44100, params: { wow: 0.25, flutter: 0.15, drift: 0.20, mix: 0.50 } },
  ],
  videoFilters: [],
  chain: [
    { kind: 'audio', id: 'a1' },
    { kind: 'audio', id: 'a2' },
  ],
};

const pipeD = new SonificationPipeline();
const resD = benchmarkFunction('Pipeline: 480x852 TapeSat+Wow', () => {
  pipeD.processFrame(imgUser, W_USER, H_USER, userTapePreset, outUser);
}, 20, 5);
console.log(`  * ${resD.name.padEnd(28)}: ${resD.avgMs.toFixed(2)} ms/frame  (${resD.fps.toFixed(1)} FPS)`);

// Output JSON report for automated before/after comparison
const report = {
  timestamp: new Date().toISOString(),
  environment: 'Node.js ' + process.version,
  resolution: `${W_480}x${H_480}`,
  videoFilters: videoResults,
  pointwiseAudio: pointwiseAudioResults,
  pipeline: [resA, pointwisePipelineResult, resB, resC],
};

fs.writeFileSync('benchmark_baseline.json', JSON.stringify(report, null, 2));
console.log('\n[Saved baseline results to benchmark_baseline.json]');
