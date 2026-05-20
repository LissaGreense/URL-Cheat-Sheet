<!--
  AtmosphereShell — composes the 5-layer ambient backdrop defined in
  spec §2.3 and renders children above it.

  Phase 1 shipped static layers. Phase 2 (Task 12) wires:
    - An inline `<svg>` `<filter id="atmosphere-turbulence">` referenced
      by `.atmosphere__ambient` (CSS `filter: url(#atmosphere-turbulence)`).
    - Three glow pads with per-pad position + phase (`--gx`/`--gy`/`--phase`).
    - Twelve spec dots with per-dot position, size, opacity, and phase.
    - The mobile fallback is in `atmosphere.css`: `(max-width: 768px)`
      strips the `feTurbulence` filter and hides dots `:nth-child(n+5)`.
  Motion gating + reduced-motion fallback is entirely in CSS (ADR 0009 —
  see `atmosphere.css` `@media (prefers-reduced-motion: no-preference)`).

  The shell wraps the entire app via `+layout.svelte`. Children render
  above all atmosphere layers via the `.atmosphere__content` block,
  which sits at z-index 1 — explicitly above the negative-z ambient
  layers and the cursor-halo (z-index 0).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { idleBreath } from '../../motion/idleBreath';
  import { cursorHalo } from '../../motion/cursorHalo';

  /**
   * Props for AtmosphereShell.
   * @property {Snippet} [children] - Slot content rendered above the
   *   atmosphere layers. Optional so the shell can be inspected in
   *   isolation (e.g. component tests, design previews); in production
   *   the layout always supplies children.
   */
  type Props = {
    children?: Snippet;
  };

  let { children }: Props = $props();

  /**
   * Glow-pad layout — three pads positioned across the viewport with
   * staggered animation phases (negative seconds = start mid-cycle so
   * the three pads desync without waiting a full 16s loop). Inline
   * styles read these into `--gx`/`--gy`/`--phase`/`--gop` custom
   * properties used by `.atmosphere__glow-pad` in atmosphere.css.
   */
  const glowPads = [
    { gx: '15%', gy: '20%', phase: '0s', gop: 0.09 },
    { gx: '60%', gy: '55%', phase: '-5s', gop: 0.07 },
    { gx: '35%', gy: '78%', phase: '-11s', gop: 0.08 }
  ] as const;

  /**
   * Spec-dot layout — twelve dots scattered across the viewport with
   * varied sizes (6–14px per spec §2.3 item 4), opacities (0.25–0.40),
   * and animation phases. Hand-tuned positions read as random; an RNG
   * would risk visual clustering. Mobile fallback in CSS hides
   * `:nth-child(n+5)` so the first four positions also have to read
   * as a balanced layout on their own.
   */
  const specDots = [
    { dx: '12%', dy: '18%', dsize: '8px', dop: 0.35, phase: '0s' },
    { dx: '78%', dy: '22%', dsize: '6px', dop: 0.3, phase: '-2s' },
    { dx: '28%', dy: '68%', dsize: '10px', dop: 0.4, phase: '-4s' },
    { dx: '88%', dy: '80%', dsize: '7px', dop: 0.28, phase: '-7s' },
    { dx: '45%', dy: '14%', dsize: '9px', dop: 0.32, phase: '-1s' },
    { dx: '8%', dy: '52%', dsize: '12px', dop: 0.25, phase: '-3s' },
    { dx: '62%', dy: '40%', dsize: '6px', dop: 0.38, phase: '-5s' },
    { dx: '92%', dy: '48%', dsize: '8px', dop: 0.3, phase: '-6s' },
    { dx: '38%', dy: '88%', dsize: '11px', dop: 0.27, phase: '-8s' },
    { dx: '72%', dy: '92%', dsize: '7px', dop: 0.33, phase: '-9s' },
    { dx: '18%', dy: '32%', dsize: '14px', dop: 0.26, phase: '-10s' },
    { dx: '55%', dy: '62%', dsize: '8px', dop: 0.36, phase: '-11s' }
  ] as const;
</script>

<div class="atmosphere">
  <!--
    Inline SVG filter — referenced by `.atmosphere__ambient` via
    `filter: url(#atmosphere-turbulence)`. The filter is fixed at the
    document level (the SVG element is invisible — `width="0"
    height="0"`, absolutely positioned out of flow) so a single
    definition serves every viewport without per-instance overhead.

    Mobile drops the filter reference entirely (atmosphere.css media
    query); the SVG stays in the DOM but isn't consulted.
  -->
  <svg
    aria-hidden="true"
    focusable="false"
    width="0"
    height="0"
    style="position: absolute; pointer-events: none;"
  >
    <filter id="atmosphere-turbulence">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.006"
        numOctaves="2"
        seed="2"
        result="noise"
      />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" />
    </filter>
  </svg>

  <!-- Layer 1: base body gradient -->
  <div class="atmosphere__base" aria-hidden="true"></div>

  <!-- Layer 2: ambient driver — references the turbulence filter above. -->
  <div class="atmosphere__ambient" aria-hidden="true"></div>

  <!--
    Layer 3: glow pads (3, per spec §2.3). Each pad reads its
    position/phase from inline custom properties; the `idleBreath`
    action stays on each pad so the slow scale-yoyo also runs (ambient
    discipline §3.4: "the page is always alive").
  -->
  {#each glowPads as pad (pad.gx + pad.gy)}
    <div
      class="atmosphere__glow-pad"
      aria-hidden="true"
      style="--gx: {pad.gx}; --gy: {pad.gy}; --phase: {pad.phase}; --gop: {pad.gop};"
      use:idleBreath
    ></div>
  {/each}

  <!--
    Layer 4: spec dots (12, per spec §2.3). Each dot reads its
    position, size, opacity, and animation phase from inline custom
    properties. Wrapped in a `.atmosphere__spec-dots` container so the
    mobile-fallback `:nth-child(n+5)` selector (in atmosphere.css)
    counts only dots, not the siblings of other layers.
  -->
  <div class="atmosphere__spec-dots" aria-hidden="true">
    {#each specDots as dot (dot.dx + dot.dy)}
      <div
        class="atmosphere__spec-dot"
        aria-hidden="true"
        style="--dx: {dot.dx}; --dy: {dot.dy}; --dsize: {dot.dsize}; --dop: {dot.dop}; --phase: {dot.phase};"
      ></div>
    {/each}
  </div>

  <!-- Layer 5a: scanline texture -->
  <div class="atmosphere__scanline" aria-hidden="true"></div>

  <!--
    Layer 5b: cursor halo. The action lerps `--cx`/`--cy` toward the
    pointer each RAF tick; the radial gradient on `.atmosphere__cursor-halo`
    (atmosphere.css) reads those custom properties. No-op on touch
    devices and under reduced motion.
  -->
  <div class="atmosphere__cursor-halo" aria-hidden="true" use:cursorHalo></div>

  <!-- Content slot — renders above all atmosphere layers -->
  <div class="atmosphere__content">
    {@render children?.()}
  </div>
</div>

<style>
  .atmosphere__content {
    position: relative;
    z-index: 1;
  }
</style>
