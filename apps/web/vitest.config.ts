import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  // The svelte-testing-library plugin flips `resolve.conditions` to
  // `browser` first so Svelte 5's client runtime (not its SSR build) is
  // loaded under jsdom — without it, component tests throw
  // `lifecycle_function_unavailable`.
  plugins: [sveltekit(), svelteTesting()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: false
  }
});
