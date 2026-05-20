import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Resolve this directory so the config behaves identically whether
// invoked from `apps/web` (workspace filter) or from the repo root
// (`bun run test`, which loads this file as a `projects` entry).
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Force the project root to `apps/web/` regardless of how vitest
  // was launched. This keeps `include` globs and Vite's module
  // resolution aligned when invoked from the repo root.
  root: here,
  // Use the bare Svelte plugin (not `sveltekit()`) so component tests
  // don't drag in SvelteKit's full app-bootstrap chain (svelte.config.js
  // discovery, src/app.html, etc.). Tests only need .svelte → JS
  // transformation. The svelte-testing-library plugin flips
  // `resolve.conditions` to `browser` first so Svelte 5's client
  // runtime (not its SSR build) is loaded under jsdom — without it,
  // component tests throw `lifecycle_function_unavailable`.
  plugins: [svelte(), svelteTesting()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: false,
    // jsdom doesn't ship `matchMedia`; the Phase 2 motion actions need
    // it (via `prefersReducedMotion`). See `vitest.setup.ts`.
    setupFiles: ['./vitest.setup.ts']
  }
});
