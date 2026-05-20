<!--
  HudPanel — the chrome wrapper for cinematic HUD content blocks
  (spec §2.3 layer 5, §2.4 instrumentation vocabulary, plan Task 2).

  Visual contract (Phase 1, static — no motion):
    - 0.5px hairline border (var(--hair); var(--amber-alarm) for variant="alarm")
    - 8px backdrop-filter blur
    - rgba(0, 0, 0, 0.15) translucent background
    - Conditional `[ ]` corner brackets (default ON) — four absolutely
      positioned hairline L-shapes pinned to each corner
    - Conditional `+++` tick cluster bottom-right (default OFF)

  Phase 2 layers motion (idleBreath, scanSweep, phosphorFlash) onto the
  same `.hud-panel` / `.hud-panel--alarm` selectors via Svelte actions —
  this file stays static.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Props for HudPanel.
   * @property {Snippet} children - Content rendered inside the panel.
   * @property {boolean} [corners=true] - Render the `[ ]` corner brackets.
   * @property {boolean} [ticks=false] - Render the `+++` tick cluster bottom-right.
   * @property {'default' | 'alarm'} [variant='default'] - `alarm` swaps
   *   the hairline border to `--amber-alarm`; `default` uses `--hair`.
   */
  type Props = {
    children: Snippet;
    corners?: boolean;
    ticks?: boolean;
    variant?: 'default' | 'alarm';
  };

  let { children, corners = true, ticks = false, variant = 'default' }: Props = $props();
</script>

<div class="hud-panel" class:hud-panel--alarm={variant === 'alarm'}>
  {#if corners}
    <span class="hud-panel__corner hud-panel__corner--tl" aria-hidden="true"></span>
    <span class="hud-panel__corner hud-panel__corner--tr" aria-hidden="true"></span>
    <span class="hud-panel__corner hud-panel__corner--bl" aria-hidden="true"></span>
    <span class="hud-panel__corner hud-panel__corner--br" aria-hidden="true"></span>
  {/if}

  <div class="hud-panel__body">
    {@render children()}
  </div>

  {#if ticks}
    <span class="hud-panel__ticks" aria-hidden="true">+++</span>
  {/if}
</div>

<style>
  /*
    The hairline border + backdrop-filter chrome (spec §2.3 layer 5).
    0.5px borders render reliably on retina; on 1x displays browsers
    snap to 1px — accepted trade.
  */
  .hud-panel {
    position: relative;
    border: 0.5px solid var(--hair);
    background: rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 1rem 1.25rem;
  }

  .hud-panel--alarm {
    border-color: var(--amber-alarm);
  }

  .hud-panel__body {
    position: relative;
    z-index: 1;
  }

  /*
    Corner brackets — four absolutely positioned L-shapes formed by a
    pair of borders on each corner element. Hairline color follows the
    panel border so the alarm variant tints corners too.
  */
  .hud-panel__corner {
    position: absolute;
    width: 8px;
    height: 8px;
    pointer-events: none;
  }
  .hud-panel--alarm .hud-panel__corner {
    border-color: var(--amber-alarm);
  }
  .hud-panel__corner--tl {
    top: -1px;
    left: -1px;
    border-top: 1px solid var(--hair);
    border-left: 1px solid var(--hair);
  }
  .hud-panel__corner--tr {
    top: -1px;
    right: -1px;
    border-top: 1px solid var(--hair);
    border-right: 1px solid var(--hair);
  }
  .hud-panel__corner--bl {
    bottom: -1px;
    left: -1px;
    border-bottom: 1px solid var(--hair);
    border-left: 1px solid var(--hair);
  }
  .hud-panel__corner--br {
    bottom: -1px;
    right: -1px;
    border-bottom: 1px solid var(--hair);
    border-right: 1px solid var(--hair);
  }

  /*
    Tick cluster — bottom-right, sys-voice micro-caps. The `+++` glyph
    cluster is a static activity-indicator placeholder; Phase 2 may
    drive opacity from a periodic action.
  */
  .hud-panel__ticks {
    position: absolute;
    bottom: 4px;
    right: 8px;
    font-family: var(--font-body);
    font-size: 10px;
    letter-spacing: 0.84px;
    color: var(--bone-dim);
    pointer-events: none;
  }
</style>
