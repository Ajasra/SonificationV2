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

const { BitcrusherFilter } = load('src/engine/filters/lofi/bitcrusher.ts');

test('Bitcrusher wrapped counter matches exact samples and state for decimation boundaries', () => {
  const optimized = new BitcrusherFilter(44100), reference = new BitcrusherFilter(44100);
  const configurations = [
    { bits: 6, downsample: 8, mix: 1 },
    { bits: 1, downsample: 1, mix: 0 },
    { bits: 16, downsample: 64, mix: .37 },
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
    optimized.processBlock(actual); reference.processBlockReference(expected);
    assert.deepEqual(actual, expected, `sample mismatch in block ${block}`);
    assert.equal(optimized.heldSample, reference.heldSample, `held sample mismatch in block ${block}`);
    assert.equal(optimized.sampleCounter, reference.sampleCounter, `counter mismatch in block ${block}`);
  }
});
