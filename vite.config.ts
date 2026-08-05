/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Single config for both dev/build and vitest. The engine core has zero runtime
// deps, so tests run headlessly in the `node` environment.
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
