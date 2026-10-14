import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStateFromPorcelain } from '../scripts/git-build-state.mjs';

test('build provenance ignores only Vite config bundles created during config loading', () => {
  const generated = '?? vite.benchmark.config.ts.timestamp-1791942052368-522b0a64f2f74.mjs\n';
  assert.deepEqual(buildStateFromPorcelain(generated), { revisionIndependentDirty: false, dirtyFiles: [] });
  const actualEdits = `${generated} M src/main.ts\n?? local-fixture.bin\n`;
  assert.deepEqual(buildStateFromPorcelain(actualEdits), {
    revisionIndependentDirty: true,
    dirtyFiles: ['src/main.ts', 'local-fixture.bin'],
  });
});
