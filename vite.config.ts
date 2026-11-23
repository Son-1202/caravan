import { defineConfig } from 'vite';

// base './' keeps the build portable (Vercel root or any sub-path).
// Art in /assets (repo root, ART-owned) is pulled in via import.meta.glob
// in src/render/assets.ts, so only files that exist get bundled.
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
