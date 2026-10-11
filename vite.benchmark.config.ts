import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;

// Loopback HTTP is a secure context for browser APIs and needs no development
// certificate exception. This harness does not expose the application backend.
export default defineConfig({
  define: { __BENCHMARK_BUILD__: JSON.stringify({ revision, dirty }) },
  server: {
    host: '127.0.0.1', port: 5175, strictPort: true,
    // SDK installation and generated builds must not reload an active measurement.
    watch: { ignored: ['**/.tools/**', '**/dist/**', '**/dist-benchmark/**', '**/test-results/**'] },
  },
  build: { outDir: 'dist-benchmark', rollupOptions: { input: 'benchmark.html' } },
});
