import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const FONT_EXT = /\.(woff2?|ttf|otf|eot)$/i;

export default defineConfig({
  plugins: [sveltekit()],
  // Vite 8 uses Rolldown as the default bundler — use `rolldownOptions`,
  // not the deprecated `rollupOptions`.
  build: {
    // Never inline fonts — strict CSP (`font-src 'self'`) rejects `data:` URIs.
    assetsInlineLimit: (filePath) => (FONT_EXT.test(filePath) ? false : undefined),
    rolldownOptions: {}
  }
});
