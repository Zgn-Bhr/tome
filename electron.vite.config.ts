import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const r = (p: string) => resolve(import.meta.dirname, p);

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rolldownOptions: {
        input: { main: r('src/platform/main.ts') },
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rolldownOptions: {
        input: { preload: r('src/platform/preload.ts') },
        // Sandboxed preloads must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: r('src/ui'),
    plugins: [react()],
    build: {
      outDir: r('out/renderer'),
      rolldownOptions: {
        input: { index: r('src/ui/index.html') },
      },
    },
    worker: { format: 'es' },
  },
});
