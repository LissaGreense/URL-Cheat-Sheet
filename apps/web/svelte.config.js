import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Strict CSP in nonce mode. SvelteKit injects per-response nonces into
 * its own inline `<script>` / `<style>` tags, so we can keep
 * `script-src` locked to `'self'` in production. See
 * `docs/specs/2026-05-20-byo-anthropic-key.md` § "Content Security Policy".
 *
 * Dev mode needs:
 *   - `'unsafe-eval'` in `script-src` for Vite's module evaluator
 *   - `ws:` / `wss:` in `connect-src` for Vite HMR's WebSocket channel
 *
 * @type {import('@sveltejs/kit').Config['kit']['csp']}
 */
const csp = {
  mode: 'nonce',
  directives: {
    'default-src': ['self'],
    'script-src': isDev ? ['self', 'unsafe-eval'] : ['self'],
    'style-src': ['self', 'unsafe-inline'],
    'connect-src': isDev ? ['self', 'ws:', 'wss:'] : ['self'],
    'img-src': ['self', 'data:'],
    'font-src': ['self'],
    'frame-ancestors': ['none'],
    'base-uri': ['self'],
    'form-action': ['self']
  }
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // Bun on Vercel is currently experimental — see docs/adr/0001-bun-on-vercel.md
      runtime: 'experimental_bun1.x'
    }),
    csp
  }
};

export default config;
