<!--
  AtmosphereShell — composes the 5-layer ambient backdrop defined in
  spec §2.3 and renders children above it.

  Phase 1 (this file) ships static layers only. Phase 2 will attach
  Svelte actions (cursorHalo, idleBreath, etc.) to these same selectors
  without changing this shell.

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
</script>

<div class="atmosphere">
  <!-- Layer 1: base body gradient -->
  <div class="atmosphere__base" aria-hidden="true"></div>

  <!-- Layer 2: ambient driver (static grain in Phase 1) -->
  <div class="atmosphere__ambient" aria-hidden="true"></div>

  <!--
    Layer 3: glow pad. Phase 1 ships ONE static centered pad; Phase 2
    duplicates this element with drift offsets. Same class — no shell
    change needed.

    `use:idleBreath` adds a slow 8s yoyo-scale so the glow gently
    pulses (spec §3.4 ambient discipline). Pure CSS — no listeners.
  -->
  <div class="atmosphere__glow-pad" aria-hidden="true" use:idleBreath></div>

  <!--
    Layer 4: spec dots. Phase 1 ships 4 static dots in fixed positions;
    Phase 2 expands to ~12 with float keyframes. Positions are inline
    styles for now — they'll move into a `data-variant` attribute when
    Phase 2 needs to choreograph staggered phases.
  -->
  <div class="atmosphere__spec-dot" aria-hidden="true" style="top: 18%; left: 12%;"></div>
  <div class="atmosphere__spec-dot" aria-hidden="true" style="top: 70%; left: 28%;"></div>
  <div class="atmosphere__spec-dot" aria-hidden="true" style="top: 40%; left: 78%;"></div>
  <div class="atmosphere__spec-dot" aria-hidden="true" style="top: 82%; left: 88%;"></div>

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
