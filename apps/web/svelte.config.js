import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // Bun on Vercel is currently experimental — see docs/adr/0001-bun-on-vercel.md
      runtime: 'experimental_bun1.x'
    })
  }
};

export default config;
