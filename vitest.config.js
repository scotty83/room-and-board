import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { xapi: new URL('./test/stubs/xapi.js', import.meta.url).pathname },
  },
  test: {
    include: ['test/**/*.test.js'],
    exclude: ['test/worker/**', 'node_modules/**'],
  },
});
