import { defineConfig } from 'vitest/config';

/**
 * Root vitest config — used when running `bun run test` from the repo root.
 *
 * Declares each workspace as its own Vitest **project** so per-workspace
 * configs (notably `apps/web/vitest.config.ts`, which registers the
 * SvelteKit + svelte-testing-library plugins) are honored. Without this,
 * the root runner has no Svelte plugin and chokes on `.svelte` imports
 * with `vite:import-analysis` parse errors.
 *
 * Vitest 4 dropped `defineWorkspace`; the canonical replacement is the
 * `test.projects` field here. Each entry is a directory path; Vitest
 * loads `<dir>/vitest.config.{ts,js}` if present, otherwise falls back
 * to the package's `vite.config.*`.
 *
 * Excludes apply globally (vendored superpowers tests belong to the
 * plugin, not us).
 */
export default defineConfig({
  test: {
    projects: ['apps/web', 'packages/*'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      '.claude/plugins/**'
    ]
  }
});
