import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename);
  const exports = {}; cache.set(filename, exports);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => load(path.resolve(path.dirname(filename), name)) }, { filename });
  return exports;
}

const { PitchShifterFilter } = load('src/engine/filters/synth/pitchshift.ts');

test('Pitchshift one-wrap/interpolation optimization matches samples and ring state', () => {
  const optimized = new PitchShifterFilter(44100), reference = new PitchShifterFilter(44100);
  const configurations = [
    { semitones: 7, window: 50, mix: 1 },
    { semitones: 24, window: 10, mix: .65 },
    { semitones: -24, window: 200, mix: .25 },
  ];
  for (let block = 0; block < 24; block++) {
    if (block === 0 || block === 8 || block === 16) {
      optimized.setParams(configurations[block / 8]);
      reference.setParams(configurations[block / 8]);
    }
    const length = [1, 2, 127, 128, 4096][block % 5];
    const input = Float32Array.from({ length }, (_, i) => Math.sin((i + block * 4096) * .019) * (i % 5 ? .7 : 1.2));
    const actual = input.slice(), expected = input.slice();
    optimized.processBlock(actual);
    reference.processBlockReference(expected);
    assert.deepEqual(actual, expected, `sample mismatch in block ${block}`);
    assert.deepEqual(optimized.buf, reference.buf, `delay ring mismatch in block ${block}`);
    assert.equal(optimized.pos, reference.pos, `write position mismatch in block ${block}`);
    assert.equal(optimized.phase, reference.phase, `grain phase mismatch in block ${block}`);
  }
});
