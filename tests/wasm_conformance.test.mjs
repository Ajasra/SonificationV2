import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';

const cache = new Map();
function load(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename);
  const exports = {}; cache.set(filename, exports);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, WebAssembly, fetch, performance, console,
    require: name => load(path.resolve(path.dirname(filename), name)),
  }, { filename });
  return exports;
}
const { FixtureRandom } = load('src/engine/fixtures/random.ts');
const { WasmDspRuntime } = load('src/engine/backends/wasm.ts');
const { TapeSaturationFilter } = load('src/engine/filters/lofi/tapesat.ts');
const { TapeWowFilter } = load('src/engine/filters/lofi/tapewow.ts');
const { MoogLadderFilter } = load('src/engine/filters/eq/moogladder.ts');
const bytes = fs.readFileSync('public/wasm/dsp-scalar.wasm');
const stateValues = (type, filter) => {
  const state = filter.exportState();
  return type === 'tapesat' ? [state.bumpLp, state.toneLp] :
    type === 'tapewow' ? [state.wowPhase, state.flutPhase, state.noise, state.noiseTarget] : state.values;
};
// Bounds declared before accepting the port. No fast math or f32 recurrence state.
const SAMPLE_MAX_ERROR = 1e-6, SAMPLE_RMS_ERROR = 1e-7, STATE_MAX_ERROR = 1e-9;
function compare(actual, expected, maxError = SAMPLE_MAX_ERROR, rmsError = SAMPLE_RMS_ERROR) {
  assert.equal(actual.length, expected.length);
  let max = 0, sum = 0;
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Number.isFinite(actual[i]) && Number.isFinite(expected[i]), `nonfinite at ${i}`);
    const error = Math.abs(actual[i] - expected[i]); max = Math.max(max, error); sum += error * error;
  }
  assert.ok(max <= maxError, `max error ${max} exceeds ${maxError}`);
  assert.ok(Math.sqrt(sum / Math.max(1, actual.length)) <= rmsError, `RMS exceeds ${rmsError}`);
}
function input(length, seed = 77) {
  const random = new FixtureRandom(seed), samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = i % 17 === 0 ? (i % 2 ? 4 : -4) : random.next() * 2 - 1;
  return samples;
}

test('fixture PRNG is reproducible, serializable and rejects zero seeds', () => {
  const a = new FixtureRandom(4821), b = new FixtureRandom(4821);
  assert.equal(a.next(), b.next()); assert.equal(a.snapshot(), b.snapshot());
  const restored = new FixtureRandom(a.snapshot()); assert.equal(restored.next(), a.next());
  assert.throws(() => new FixtureRandom(0)); assert.throws(() => new FixtureRandom(-1));
});

test('WASM-owned pipeline arena matches copied segment output and reuses its view', async () => {
  const runtime = await WasmDspRuntime.fromBytes(bytes);
  try {
    const inputSamples = input(32771), expected = new Float32Array(inputSamples), arena = runtime.getSampleBuffer(inputSamples.length);
    assert.equal(arena.buffer, runtime.exports.memory.buffer);
    assert.equal(runtime.getSampleBuffer(100).buffer, arena.buffer);
    arena.set(inputSamples);
    const copiedFilter = runtime.createFilter('tapesat', 44100, 4821);
    const arenaFilter = runtime.createFilter('tapesat', 44100, 4821);
    runtime.processSegment([copiedFilter], expected);
    arena.set(inputSamples);
    runtime.processSegment([arenaFilter], arena);
    compare(arena, expected);
    compare(arenaFilter.exportState().values, copiedFilter.exportState().values, 0, 0);
    copiedFilter.dispose(); arenaFilter.dispose();
  } finally { runtime.dispose(); }
});

test('committed WASM artifact matches pinned source/build metadata', () => {
  const hash = value => createHash('sha256').update(value).digest('hex');
  for (const variant of ['scalar', 'simd']) {
    const metadata = JSON.parse(fs.readFileSync(`public/wasm/dsp-${variant}.build.json`, 'utf8'));
    assert.equal(metadata.sourceSha256, hash(fs.readFileSync('native/dsp/dsp.cpp')));
    assert.equal(metadata.wasmSha256, hash(fs.readFileSync(`public/wasm/dsp-${variant}.wasm`)));
    assert.equal(metadata.emscripten, '6.0.12');
  }
});

test('SIMD candidate matches reference samples, states and fused tape segment', async () => {
  const runtime = await WasmDspRuntime.fromBytes(fs.readFileSync('public/wasm/dsp-simd.wasm'));
  try {
    for (const [type, Class] of [['tapesat', TapeSaturationFilter], ['tapewow', TapeWowFilter], ['moogladder', MoogLadderFilter]]) {
      for (const rate of [8000, 44100, 48000, 96000]) {
        const random = new FixtureRandom(4821), reference = new Class(rate, random.next), filter = runtime.createFilter(type, rate);
        for (const length of [1, 2, 8191, 8192, 8193, 22051]) {
          const expected = input(length), actual = expected.slice();
          reference.processBlock(expected); filter.processBlock(actual); compare(actual, expected);
          compare(filter.exportState().values.slice(0, stateValues(type, reference).length), stateValues(type, reference), STATE_MAX_ERROR, STATE_MAX_ERROR);
          if (type === 'tapewow') { compare(filter.exportState().buffer, reference.exportState().buffer, 0, 0); assert.equal(filter.exportState().randomState, random.snapshot()); }
        }
        filter.dispose();
      }
    }
    const random = new FixtureRandom(4821), reference = [new TapeSaturationFilter(), new TapeWowFilter(44100, random.next)];
    const filters = [runtime.createFilter('tapesat', 44100), runtime.createFilter('tapewow', 44100)];
    const expected = input(1280 * 720 * 3), actual = expected.slice();
    for (let offset = 0; offset < expected.length; offset += 8192) for (const filter of reference) filter.processBlock(expected.subarray(offset, offset + 8192));
    runtime.processSegment(filters, actual); compare(actual, expected);
  } finally { runtime.dispose(); }
});

for (const [type, Class] of [['tapesat', TapeSaturationFilter], ['tapewow', TapeWowFilter], ['moogladder', MoogLadderFilter]]) {
  test(`${type} scalar WASM matches samples and retained history across boundaries`, async () => {
    const runtime = await WasmDspRuntime.fromBytes(bytes);
    try {
      for (const rate of [8000, 44100, 48000, 96000]) {
        const random = new FixtureRandom(4821), reference = new Class(rate, random.next), filter = runtime.createFilter(type, rate);
        for (const length of [0, 1, 2, 17, 8191, 8192, 8193, 22051, 0, 100003]) {
          const expected = input(length), actual = expected.slice();
          filter.setParams(reference.getParams());
          reference.processBlock(expected); filter.processBlock(actual); compare(actual, expected);
          compare(Array.from(filter.exportState().values).slice(0, stateValues(type, reference).length), stateValues(type, reference), STATE_MAX_ERROR, STATE_MAX_ERROR);
          if (type === 'tapewow') {
            const js = reference.exportState(), wasm = filter.exportState();
            compare(wasm.buffer, js.buffer, 0, 0);
            assert.equal(wasm.pos, js.pos); assert.equal(wasm.noiseCount, js.noiseCount);
            assert.equal(wasm.randomState, random.snapshot());
          }
        }
        reference.init(); filter.init();
        const expected = input(8193), actual = expected.slice();
        reference.processBlock(expected); filter.processBlock(actual); compare(actual, expected);
        filter.dispose();
      }
    } finally { runtime.dispose(); }
  });
}

test('TapeWow controlled sequences repeat; arbitrary partition changes are not assumed bit-exact', () => {
  const randomA = new FixtureRandom(4821), randomB = new FixtureRandom(4821);
  const a = new TapeWowFilter(44100, randomA.next), b = new TapeWowFilter(44100, randomB.next);
  for (const length of [8191, 2, 11025, 8193]) {
    const first = input(length), second = first.slice();
    a.processBlock(first); b.processBlock(second); assert.deepEqual(first, second);
  }
  assert.equal(randomA.snapshot(), randomB.snapshot());
  const snapshot = a.exportState(); snapshot.buffer.fill(0);
  assert.ok(a.exportState().buffer.some(value => value !== 0), 'snapshot must own its history');
});

test('complete tape segment preserves chunk/filter order and sample stores', async () => {
  const runtime = await WasmDspRuntime.fromBytes(bytes);
  try {
    const tapeRandom = new FixtureRandom(4821);
    const reference = [new TapeSaturationFilter(), new TapeWowFilter(44100, tapeRandom.next)];
    const filters = [runtime.createFilter('tapesat', 44100), runtime.createFilter('tapewow', 44100)];
    for (let frame = 0; frame < 3; frame++) {
      const expected = input(1280 * 720 * 3, frame + 77), actual = expected.slice();
      for (let offset = 0; offset < expected.length; offset += 8192) {
        const block = expected.subarray(offset, Math.min(offset + 8192, expected.length));
        for (const filter of reference) filter.processBlock(block);
      }
      runtime.processSegment(filters, actual); compare(actual, expected);
      assert.equal(filters[1].exportState().randomState, tapeRandom.snapshot());
      compare(filters[1].exportState().values.slice(0, 4), stateValues('tapewow', reference[1]), STATE_MAX_ERROR, STATE_MAX_ERROR);
    }
  } finally { runtime.dispose(); }
});

test('backend parameter updates preserve state and reject invalid ownership', async () => {
  const runtime = await WasmDspRuntime.fromBytes(bytes), other = await WasmDspRuntime.fromBytes(bytes);
  try {
    const filter = runtime.createFilter('moogladder', 44100), reference = new MoogLadderFilter();
    for (const params of [{}, { cutoff: 5000, resonance: 3.5 }, { cutoff: -1, drive: 8, resonance: -2 }]) {
      filter.setParams(params); reference.setParams(params);
      const expected = input(8193), actual = expected.slice();
      reference.processBlock(expected); filter.processBlock(actual); compare(actual, expected);
      assert.deepEqual(JSON.parse(JSON.stringify(filter.getParams())), JSON.parse(JSON.stringify(reference.getParams())));
    }
    assert.throws(() => filter.setParams({ cutoff: NaN }), /Non-finite/);
    assert.throws(() => runtime.createFilter('amplify', 44100), /Unsupported/);
    assert.throws(() => runtime.createFilter('tapesat', 0), /Invalid/);
    assert.throws(() => other.processSegment([filter], input(10)), /Mixed/);
    filter.dispose(); assert.throws(() => filter.processBlock(input(10)), /disposed/);
    runtime.dispose(); runtime.dispose(); assert.throws(() => runtime.createFilter('tapesat', 44100), /disposed/);
  } finally { runtime.dispose(); other.dispose(); }
});
