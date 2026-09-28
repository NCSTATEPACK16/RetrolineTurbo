/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Single config for both dev/build and vitest. The engine core has zero runtime
// deps, so tests run headlessly in the `node` environment.
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    // 1.x ships from index.html; 2.0 grows alongside it at /v2.html until it replaces 1.x.
    rollupOptions: {
      input: { main: 'index.html', v2: 'v2.html' },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
