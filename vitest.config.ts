import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'sync',
          include: ['tests/sync/**/*.test.ts'],
          environment: 'node',
          // Publishes the module to a throwaway local database before the run.
          globalSetup: ['tests/sync/global-setup.ts'],
          // Test files share one database, so run them one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
