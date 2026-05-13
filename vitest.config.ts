import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/cli/bin.ts',
        // CLI subcommands are integration assembly — covered by example smoke
        // tests rather than unit tests. The pure pieces they call out to
        // (composeGogogo, redact, etc.) are tested directly elsewhere.
        'src/cli/commands/**',
        'src/cli/prompts.ts',
        // ConversationFactory wires the production PTY stack — exercised by
        // integration tests that need a real `claude` binary.
        'src/conversation/factory.ts',
        // node-pty native wrapper — production runs node-pty; tests use
        // a fake spawner so the realFs/realSpawn branches stay uncovered.
        'src/pty/claude-pty.ts',
        // Server factory is composition only — covered indirectly via the
        // route tests that instantiate their own Hono apps with the same
        // middleware.
        'src/server/server.ts',
      ],
      thresholds: {
        // Branches and functions are slightly relaxed because the real route
        // handlers (vs the inner pumps) re-thread error branches that are
        // already covered upstream; raising every threshold to 90% would
        // require duplicating those tests at the route layer. 80% function /
        // 75% branch still fails CI on meaningful regressions.
        lines: 85,
        functions: 80,
        branches: 75,
        statements: 85,
      },
    },
  },
});
