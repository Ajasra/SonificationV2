import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

let randomState = 1;
const deterministicMath = Object.create(Math);
deterministicMath.random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x100000000;
};
const cache = new Map();
function load(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename);
  const exports = {}; cache.set(filename, exports);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, Math: deterministicMath, require: name => load(path.resolve(path.dirname(filename), name)) }, { filename });
  return exports;
}

const { GranularFilter } = load('src/engine/filters/synth/granular.ts');

test('Granular active-slot traversal matches output, random consumption, and state exactly', () => {
  const optimized = new GranularFilter(44100), reference = new GranularFilter(44100);
  const configurations = [
    { size: 80, density: 12, pitchScatter: 3, posJitter: 100, mix: .8 },
    { size: 300, density: 50, pitchScatter: 12, posJitter: 500, mix: 1 },
    { size: 10, density: 1, pitchScatter: 0, posJitter: 0, mix: 0 },
  ];
  for (let block = 0; block < 36; block++) {
    if (block === 18) { optimized.init(); reference.init(); }
    if (block === 0 || block === 12 || block === 24) {
      optimized.setParams(configurations[block / 12]);
      reference.setParams(configurations[block / 12]);
    }
    const length = [1, 2, 127, 128, 4096][block % 5];
    const input = Float32Array.from({ length }, (_, i) => Math.sin((i + block * 4096) * .019) * (i % 5 ? .7 : 1.2));
    const actual = input.slice(), expected = input.slice();
    randomState = 0x12345678;
    optimized.processBlock(actual);
    const candidateRandomState = randomState;
    randomState = 0x12345678;
    reference.processBlockReference(expected);
    assert.equal(randomState, candidateRandomState, `random consumption mismatch in block ${block}`);
    assert.deepEqual(actual, expected, `sample mismatch in block ${block}`);
    for (const state of ['buf', 'active', 'start', 'age', 'len', 'ratio']) {
      assert.deepEqual(optimized[state], reference[state], `${state} mismatch in block ${block}`);
    }
    assert.equal(optimized.pos, reference.pos, `write position mismatch in block ${block}`);
  }
});
