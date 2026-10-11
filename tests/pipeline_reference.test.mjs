import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function harness() {
  const created = [];
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(file);
    if (cache.has(filename)) return cache.get(filename);
    if (filename.endsWith(path.sep + path.normalize('filters/factory.ts'))) {
      return { createFilterInstance(type, sampleRate) {
        const filter = { type, sampleRate, calls: 0, params: {},
          setParams(params) { this.params = params; },
          processBlock(samples) { this.calls++; for (let i = 0; i < samples.length; i++) samples[i] *= this.params.gain ?? 1; },
        };
        created.push(filter); return filter;
      } };
    }
    if (filename.endsWith(path.normalize('video-filters/factory.ts'))) {
      return { createVideoFilterInstance(type) {
        const filter = { type, calls: 0, params: {},
          init(width, height) { this.size = [width, height]; },
          setParams(params) { this.params = params; },
          processFrame(pixels, context) { this.calls++; this.context = context; pixels[0] += this.params.offset ?? 1; },
        };
        created.push(filter); return filter;
      } };
    }
    const exports = {};
    cache.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, { exports, performance, console,
      require: name => load(path.resolve(path.dirname(filename), name)),
    }, { filename });
    return exports;
  }
  return { Pipeline: load('src/engine/pipeline.ts').SonificationPipeline, created };
}
function preset() {
  const stream = { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' };
  return { id: 'reference', name: 'reference', reader: stream, writer: { ...stream }, equalize: false,
    blendMode: 'NONE', blendAmount: 0,
    filters: [{ id: 'a', type: 'test-a', enabled: true, sampleRate: 44100, params: { gain: 0.5 } }],
    videoFilters: [], chain: [{ kind: 'audio', id: 'a' }],
  };
}
const pixels = () => new Uint8ClampedArray([40, 90, 180, 255, 110, 70, 200, 255]);

test('same-object bypass freezes history and enabling resumes the instance', () => {
  const { Pipeline, created } = harness(), pipeline = new Pipeline(), cfg = preset();
  pipeline.processFrame(pixels(), 2, 1, cfg);
  const node = created[0];
  cfg.filters[0].enabled = false;
  assert.deepEqual(Array.from(pipeline.processFrame(pixels(), 2, 1, cfg).outputRgba), Array.from(pixels()));
  assert.equal(node.calls, 1);
  cfg.filters[0].enabled = true;
  pipeline.processFrame(pixels(), 2, 1, cfg);
  assert.equal(created.length, 1);
  assert.equal(node.calls, 2);
});

test('replacement configs with identical structure refresh parameter references', () => {
  const { Pipeline, created } = harness(), pipeline = new Pipeline(), cfg = preset();
  const before = Array.from(pipeline.processFrame(pixels(), 2, 1, cfg).audioSamples);
  cfg.filters[0] = { ...cfg.filters[0], params: { gain: 0.25 } };
  const after = Array.from(pipeline.processFrame(pixels(), 2, 1, cfg).audioSamples);
  assert.deepEqual(after, before.map(x => x * 0.5));
  assert.equal(created.length, 1);
  const replacement = structuredClone(cfg);
  replacement.filters[0].params.gain = 1;
  pipeline.processFrame(pixels(), 2, 1, replacement);
  assert.equal(created[0].params.gain, 1);
});

test('in-place mixed-chain reorder keeps instances and changes operation order', () => {
  const { Pipeline, created } = harness(), pipeline = new Pipeline(), cfg = preset();
  cfg.videoFilters.push({ id: 'v', type: 'test-video', enabled: true, params: { offset: 20 } });
  cfg.chain.push({ kind: 'video', id: 'v' });
  const first = Array.from(pipeline.processFrame(pixels(), 2, 1, cfg).outputRgba);
  cfg.chain.reverse();
  const second = Array.from(pipeline.processFrame(pixels(), 2, 1, cfg).outputRgba);
  assert.notDeepEqual(second, first);
  assert.equal(created.length, 2);
  assert.ok(created.every(node => node.calls === 2));
});

test('removal, sample-rate and type edits invalidate incompatible histories', () => {
  const { Pipeline, created } = harness(), pipeline = new Pipeline(), cfg = preset();
  pipeline.processFrame(pixels(), 2, 1, cfg);
  cfg.filters[0].sampleRate = 48000;
  pipeline.processFrame(pixels(), 2, 1, cfg);
  cfg.filters[0].type = 'test-b';
  pipeline.processFrame(pixels(), 2, 1, cfg);
  const removed = cfg.filters.pop();
  pipeline.processFrame(pixels(), 2, 1, cfg);
  cfg.filters.push(removed);
  pipeline.processFrame(pixels(), 2, 1, cfg);
  assert.equal(created.length, 4);
  assert.equal(created[1].sampleRate, 48000);
  assert.equal(created[2].type, 'test-b');
});

test('disabled incompatible nodes cannot revive old history', () => {
  const { Pipeline, created } = harness(), pipeline = new Pipeline(), cfg = preset();
  pipeline.processFrame(pixels(), 2, 1, cfg);
  cfg.filters[0].enabled = false;
  cfg.filters[0].sampleRate = 48000;
  pipeline.processFrame(pixels(), 2, 1, cfg);
  assert.equal(created.length, 1);
  cfg.filters[0].sampleRate = 44100;
  cfg.filters[0].enabled = true;
  pipeline.processFrame(pixels(), 2, 1, cfg);
  assert.equal(created.length, 2);
});

test('video bypass retains history; resize invalidates it', () => {
  const { Pipeline, created } = harness(), pipeline = new Pipeline(), cfg = preset();
  cfg.filters = [];
  cfg.videoFilters = [{ id: 'v', type: 'test-video', enabled: true, params: {} }];
  pipeline.processFrame(pixels(), 2, 1, cfg);
  cfg.videoFilters[0].enabled = false;
  pipeline.processFrame(pixels(), 2, 1, cfg);
  cfg.videoFilters[0].enabled = true;
  pipeline.processFrame(pixels(), 2, 1, cfg);
  assert.equal(created.length, 1);
  assert.equal(created[0].calls, 2);
  pipeline.processFrame(pixels(), 1, 2, cfg);
  assert.equal(created.length, 2);
});

test('inputs remain unchanged; reused outputs and sample views have documented lifetimes', () => {
  const { Pipeline } = harness(), pipeline = new Pipeline(), cfg = preset();
  const input = pixels(), snapshot = input.slice(), target = new Uint8ClampedArray(input.length);
  const first = pipeline.processFrame(input, 2, 1, cfg, target);
  const retained = first.audioSamples.slice();
  assert.equal(first.outputRgba, target);
  assert.deepEqual(input, snapshot);
  const second = pipeline.processFrame(new Uint8ClampedArray(input.length).fill(255), 2, 1, cfg, target);
  assert.equal(first.audioSamples.buffer, second.audioSamples.buffer);
  assert.notDeepEqual(Array.from(first.audioSamples), Array.from(retained));
  assert.deepEqual(input, snapshot);
});

test('overlapping input/output views are rejected; disjoint views are supported', () => {
  const { Pipeline } = harness(), pipeline = new Pipeline(), cfg = preset();
  const memory = new Uint8ClampedArray(24);
  const input = memory.subarray(0, 8);
  input.set(pixels());
  assert.throws(() => pipeline.processFrame(input, 2, 1, cfg, input), /must not overlap/);
  assert.throws(() => pipeline.processFrame(input, 2, 1, cfg, memory.subarray(4, 12)), /must not overlap/);
  assert.doesNotThrow(() => pipeline.processFrame(input, 2, 1, cfg, memory.subarray(8, 16)));
});

test('profiling is opt-in and preserves samples; the effect clock is explicitly injectable', () => {
  const { Pipeline, created } = harness(), cfg = preset();
  cfg.videoFilters = [{ id: 'v', type: 'test-video', enabled: true, params: {} }];
  const reference = new Pipeline().processFrame(pixels(), 2, 1, cfg);
  const profiled = new Pipeline().processFrame(pixels(), 2, 1, cfg, undefined, { profile: true, timeMs: 1234.5 });
  assert.equal(reference.timings, undefined);
  assert.deepEqual(Array.from(profiled.audioSamples), Array.from(reference.audioSamples));
  assert.deepEqual(Array.from(profiled.outputRgba), Array.from(reference.outputRgba));
  assert.equal(created.at(-1).context.timeMs, 1234.5);
  assert.equal(Object.keys(profiled.timings).length, 9);
  assert.ok(Object.values(profiled.timings).every(value => Number.isFinite(value) && value >= 0));
  assert.ok(Object.values(profiled.timings).reduce((sum, value) => sum + value, 0) <= profiled.executionTimeMs);
});

test('timing summaries report nearest-rank percentiles and reject invalid measurements', () => {
  const filename = path.resolve('src/benchmark/report.ts');
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports }, { filename });
  assert.deepEqual(JSON.parse(JSON.stringify(exports.summarize([]))), { count: 0, p50: null, p95: null, p99: null });
  const summary = exports.summarize(Array.from({ length: 100 }, (_, i) => 100 - i));
  assert.equal(summary.p50, 50); assert.equal(summary.p95, 95); assert.equal(summary.p99, 99);
  assert.throws(() => exports.summarize([NaN]), /Invalid/);
  assert.throws(() => exports.summarize([-1]), /Invalid/);
});
