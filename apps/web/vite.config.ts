import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // Vite 8 uses Rolldown as the default bundler — use `rolldownOptions`,
  // not the deprecated `rollupOptions`.
  build: {
    rolldownOptions: {}
  }
});
