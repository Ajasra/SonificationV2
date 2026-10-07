import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [
    basicSsl(),
  ],
  server: {
    host: true, // Allow connections from phone on local WiFi
    port: 5173,
    https: true,
  },
  worker: {
    format: 'es',
  },
});
