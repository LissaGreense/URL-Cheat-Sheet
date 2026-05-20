<!--
  Root layout — owns the global atmosphere shell and the one-time
  side-effect imports of the design-token stylesheet, the static
  atmosphere stylesheet, and the fontsource webfonts shipped in
  Phase 1 of the cinematic-memex-hud redesign.

  Everything below the AtmosphereShell wrapper is the existing
  routes/+page.svelte (untouched in Task 1 — Task 3/5 re-skins it).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { gsap } from 'gsap';
  import Lenis from 'lenis';

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
  import { registerGsap } from '../lib/motion/registerGsap';
  import { prefersReducedMotion } from '../lib/motion/_reducedMotion';

  /**
   * Layout props.
   * @property {Snippet} children - SvelteKit-provided page snippet.
   */
  type Props = {
    children: Snippet;
  };

  let { children }: Props = $props();

  onMount(() => {
    // Register GSAP plugins once. Safe under reduced-motion — registration
    // is a no-op until something animates (see ADR 0009).
    registerGsap();

    // Strict reduced-motion fallback: skip Lenis entirely so the browser's
    // native (non-inertial) scroll is what the user gets. ADR 0009.
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({ smoothWheel: true });

    // Drive Lenis from GSAP's ticker so any scroll-linked GSAP animations
    // stay in lockstep with the smoothed scroll position. GSAP ticker
    // passes time in seconds; Lenis.raf expects milliseconds.
    const tick = (time: number): void => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  });
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
