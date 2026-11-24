import { defineConfig } from 'vite';

// Keep in sync with DEFAULT_PORT in shared/src/constants.ts (config files can't import TS workspaces).
const serverPort = Number(process.env.PORT ?? 8080);

export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/ws': { target: `ws://localhost:${serverPort}`, ws: true } },
  },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
});
