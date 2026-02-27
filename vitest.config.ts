import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // TZ is set via cross-env in npm scripts so date calculations are deterministic.
    // Do NOT set process.env.TZ here — Node ignores TZ changes after startup.
    include: ['src/**/*.test.ts'],
  },
});
