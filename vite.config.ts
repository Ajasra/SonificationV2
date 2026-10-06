import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // Allow connections from phone on local WiFi
    port: 5173,
  },
  worker: {
    format: 'es',
  },
});
