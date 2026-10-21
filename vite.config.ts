import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStateFromPorcelain } from './scripts/git-build-state.mjs';

const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
const { revisionIndependentDirty: dirty, dirtyFiles } = buildStateFromPorcelain(status);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      pocketbase: path.resolve(__dirname, 'node_modules/pocketbase/dist/pocketbase.es.mjs'),
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
    exclude: ['pocketbase'],
  },
  define: {
    __APP_BUILD__: JSON.stringify({ revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty, dirtyFiles }),
  },
  plugins: [
    basicSsl(),
  ],
  server: {
    host: true, // Allow connections from phone on local WiFi
    port: 5175,
    strictPort: true,
    https: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8090', changeOrigin: true },
      '/_': { target: 'http://127.0.0.1:8090', changeOrigin: true },
    },
  },
  worker: {
    format: 'es',
  },
});
