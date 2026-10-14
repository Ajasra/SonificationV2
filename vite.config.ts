import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import {execFileSync} from 'node:child_process';
import {buildStateFromPorcelain} from './scripts/git-build-state.mjs';

const status=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
const {revisionIndependentDirty:dirty,dirtyFiles}=buildStateFromPorcelain(status);

export default defineConfig({
  define:{__APP_BUILD__:JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty,dirtyFiles})},
  plugins: [
    basicSsl(),
  ],
  server: {
    host: true, // Allow connections from phone on local WiFi
    port: 5173,
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
