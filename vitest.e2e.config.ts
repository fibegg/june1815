import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    setupFiles: [],
    // SSE turns + real claude can take a while.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    teardownTimeout: 30_000,
    // E2E tests serialize on a single port; one fork keeps them ordered
    // and avoids cross-test interference.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    // Coverage is enforced by the unit suite; e2e exists to validate
    // behavior end-to-end against a real claude.
    coverage: { enabled: false },
  },
});
