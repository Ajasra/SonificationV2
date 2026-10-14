const transientViteConfigBundle = /^vite(?:\.benchmark)?\.config\.ts\.timestamp-[\w-]+\.mjs$/;

export function buildStateFromPorcelain(status) {
  const dirtyFiles = status.trim().split(/\r?\n/).filter(Boolean)
    .map(line => line.slice(3))
    .filter(file => !transientViteConfigBundle.test(file));
  return { revisionIndependentDirty: dirtyFiles.length > 0, dirtyFiles };
}
