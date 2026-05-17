import { defineConfig } from 'vitest/config';

/**
 * Root vitest config — used when running `bun run test` from the repo root.
 * Excludes vendored superpowers tests (they belong to the plugin, not us).
 * Per-workspace tests use their own configs (e.g. apps/web/vitest.config.ts).
 */
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      '.claude/plugins/**'
    ]
  }
});
