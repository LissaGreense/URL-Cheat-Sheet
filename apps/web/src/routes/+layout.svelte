<!--
  Root layout — owns the global atmosphere shell and the one-time
  side-effect imports of the design-token stylesheet, the static
  atmosphere stylesheet, and the fontsource webfonts shipped in
  Phase 1 of the cinematic-memex-hud redesign.

  Everything below the AtmosphereShell wrapper is the existing
  routes/+page.svelte (untouched in Task 1 — Task 3/5 re-skins it).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  // Design tokens (palette / type / easing / duration) — applied at :root.
  import '../lib/styles/tokens.css';

  // Static atmosphere layer styles — Phase 1 only, no @keyframes yet.
  import '../lib/styles/atmosphere.css';

  // Webfont faces. Fontsource ships self-hosted woff2 so no preconnect or
  // app.html change is required.
  import '@fontsource/manrope/400.css';
  import '@fontsource/manrope/500.css';
  import '@fontsource/space-grotesk/500.css';
  import '@fontsource/space-grotesk/600.css';

  import AtmosphereShell from '../lib/components/atmosphere/AtmosphereShell.svelte';

  /**
   * Layout props.
   * @property {Snippet} children - SvelteKit-provided page snippet.
   */
  type Props = {
    children: Snippet;
  };

  let { children }: Props = $props();
</script>

<AtmosphereShell>
  {@render children()}
</AtmosphereShell>

<style>
  /*
    Body background lives on :global so it survives Svelte's scoping.
    Mirrors the spec §2.1 recipe; the atmosphere shell layers paint
    additional gradients on top.
  */
  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    min-height: 100vh;
    background: var(--ink-base);
    color: var(--bone);
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
  }
</style>
