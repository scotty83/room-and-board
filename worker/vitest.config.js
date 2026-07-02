import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Paths resolve against the CWD (project root), not this file.
  plugins: [cloudflareTest({ wrangler: { configPath: 'worker/wrangler.toml' } })],
  test: {
    include: ['test/worker/**/*.test.js'],
  },
});
