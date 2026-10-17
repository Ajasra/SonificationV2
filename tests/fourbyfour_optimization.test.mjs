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

const { FourByFourPoleFilter } = load('src/engine/filters/modulation/fourbyfour.ts');

test('unrolled FourByFour path matches reference samples and state across blocks and parameter resets', () => {
  const optimized = new FourByFourPoleFilter(44100);
  const reference = new FourByFourPoleFilter(44100);
  const params = [
    { f0: 10, f1: 10000, f2: 15000, f3: 20000, fb0: 0, fb1: 0, fb2: 0, fb3: 0 },
    { f0: 100, f1: 900, f2: 6500, f3: 17000, fb0: .7, fb1: -.4, fb2: .2, fb3: -.1 },
    { f0: 20000, f1: 10, f2: 10000, f3: 300, fb0: -.95, fb1: .95, fb2: -.8, fb3: .6 },
  ];
  for (let block = 0; block < 24; block++) {
    if (block === 0 || block === 8 || block === 16) {
      const current = params[block / 8];
      optimized.setParams(current);
      reference.setParams(current);
    }
    const length = [1, 2, 127, 128, 4096][block % 5];
    const input = Float32Array.from({ length }, (_, i) => Math.sin((i + block * 4096) * .013) * (i % 7 ? .7 : 1.8));
    const actual = input.slice();
    const expected = input.slice();
    optimized.processBlock(actual);
    reference.processBlockReference(expected);
    assert.deepEqual(actual, expected, `output mismatch in block ${block}`);
    assert.deepEqual(optimized.ap.map(stage => stage.zm1), reference.ap.map(stage => stage.zm1), `stage history mismatch in block ${block}`);
    assert.deepEqual([optimized.y0, optimized.y1, optimized.y2, optimized.y3], [reference.y0, reference.y1, reference.y2, reference.y3], `feedback history mismatch in block ${block}`);
  }
});
