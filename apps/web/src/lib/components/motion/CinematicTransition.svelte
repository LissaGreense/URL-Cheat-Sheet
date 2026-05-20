<!--
  CinematicTransition — the "memory load" moment (spec §4.2, plan Task 13).

  Orchestrates the extracting → ready transition as a single GSAP
  timeline:

    1. Vertical bar completes top-to-bottom (`--dur-cinema / 2`).
    2. HUD panel collapses via clip-path mask sweep + scale-to-0.6 +
       translate up.
    3. Simultaneously the chat surface materializes — opacity reveal
       and a `scale 0.96 → 1` settle of the composer placeholder.

  Total target ~1600ms (`--dur-cinema`).

  The component is overlaid on top of the page during the transition;
  the parent (`+page.svelte`) holds the underlying state at `extracting`
  until `onComplete` fires, then advances to `ready`. See Approach A
  in the task brief.

  ## Reduced-motion contract (ADR 0009)

  When `prefers-reduced-motion: reduce` is set, the entire timeline is
  skipped. `onComplete` fires synchronously inside `onMount`, so the
  parent advances state immediately and the overlay unmounts on the
  next render with no visible animation. No GSAP runtime touches the
  DOM in reduced mode.

  ## Why the prop signature is narrow

  `from: 'extracting'` and `to: 'ready'` are literal string types —
  every other state transition is a plain swap. The HUD only has one
  cinematic moment, and pinning the types here lets the type-checker
  catch accidental misuse from `+page.svelte`.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { prefersReducedMotion } from '../../motion/_reducedMotion';

  /**
   * Props for CinematicTransition.
   * @property {'extracting'} from - Source state. Locked to `'extracting'`
   *   because this transition is the only cinematic moment in the HUD
   *   (spec §4.2). Passing any other value is a type error at compile.
   * @property {'ready'} to - Target state. Locked to `'ready'` for the
   *   same reason — there is no other "load completed" transition.
   * @property {() => void} onComplete - Called when the timeline finishes
   *   (or immediately under reduced-motion). The parent uses this as the
   *   signal to flip the underlying state from `extracting` to `ready`,
   *   which unmounts this overlay.
   */
  type Props = {
    from: 'extracting';
    to: 'ready';
    onComplete: () => void;
  };

  // `from` and `to` are part of the public contract — they pin the
  // transition's semantic direction so accidental misuse from
  // `+page.svelte` is a compile-time error. We surface them as
  // `data-*` attributes on the overlay so the lint rule
  // (`svelte/no-unused-props`) is satisfied and a DOM inspection
  // tells the reader which beat is in flight.
  let { from, to, onComplete }: Props = $props();

  // Element refs bound by the template. The timeline tweens target these
  // directly — GSAP accepts raw DOM nodes for its tween targets.
  let bar: HTMLDivElement;
  let panel: HTMLDivElement;
  let chatSurface: HTMLDivElement;

  onMount(() => {
    // ADR 0009 strict fallback: skip the timeline entirely. Fire the
    // completion callback synchronously so the parent's state machine
    // advances to `ready` on the same tick, the overlay unmounts, and
    // the user sees an instant state swap with zero animation.
    if (prefersReducedMotion()) {
      onComplete();
      return;
    }

    // Single timeline — keeps the choreography deterministic and lets
    // the parent rely on a single `onComplete` event firing when the
    // last beat finishes. Each `.to` is positioned with relative offsets
    // ('-=N') so the bar→panel→chat beats overlap without one waiting
    // for the previous to fully complete (matches spec §4.2's
    // "simultaneously" language).
    const tl = gsap.timeline({ onComplete });

    // Beat 1: vertical bar completes top-to-bottom in `--dur-cinema / 2`.
    // The bar starts at scaleY(0) (Phase 1's extracting bar idle frame)
    // and grows to scaleY(1) in 800ms.
    tl.to(bar, {
      scaleY: 1,
      duration: 0.8,
      ease: 'expo.out'
    });

    // Beat 2: HUD panel collapses. Starts at the 50% mark of beat 1
    // (`-=0.4` rewinds the playhead 400ms) so the panel begins folding
    // while the bar is still completing — that's the "memory chip
    // materializing as the bar finishes" visual.
    tl.to(
      panel,
      {
        scale: 0.6,
        y: -100,
        opacity: 0,
        clipPath: 'inset(0 0 100% 0)',
        duration: 0.8,
        ease: 'expo.out'
      },
      '-=0.4'
    );

    // Beat 3: chat surface materializes. Runs in parallel with the
    // panel collapse (`-=0.3` rewinds further) so the eye sees the new
    // surface arrive as the old one disappears. The composer scales
    // from 0.96 → 1 inside the chat surface via the same tween (we
    // animate the wrapper's transform rather than nest a second tween
    // so the timeline stays flat).
    tl.to(
      chatSurface,
      {
        opacity: 1,
        scale: 1,
        duration: 0.5,
        ease: 'expo.out'
      },
      '-=0.3'
    );

    // Cleanup: kill the timeline if the component unmounts mid-flight.
    // GSAP timelines that target detached nodes won't crash, but the
    // RAF-driven ticker would keep churning until the timeline finishes
    // naturally — kill explicitly to release that work.
    return () => {
      tl.kill();
    };
  });
</script>

<!--
  The overlay sits above the page (z-index above the state component
  surface but below the settings drawer). The three child surfaces are
  positioned absolutely so the timeline can transform them independently.
-->
<div
  class="cinematic-transition"
  data-testid="cinematic-transition"
  data-from={from}
  data-to={to}
  aria-hidden="true"
>
  <div bind:this={bar} class="cinematic-transition__bar"></div>
  <div bind:this={panel} class="cinematic-transition__panel">
    <!-- Visual stand-in for the collapsing HUD panel. The content is
         decorative — the parent has already painted the real extracting
         state behind this overlay; this is what visually "folds away". -->
    <div class="cinematic-transition__panel-body"></div>
  </div>
  <div bind:this={chatSurface} class="cinematic-transition__chat">
    <p class="cinematic-transition__greeting">URL has been loaded to your memory.</p>
    <p class="cinematic-transition__greeting">Ask questions to get knowledge access.</p>
    <div class="cinematic-transition__composer-placeholder"></div>
  </div>
</div>

<style>
  /*
    The overlay covers the viewport so the underlying extracting state
    is visually replaced by this timeline-driven surface during the
    transition. z-index sits above the state component (z-index: 1 on
    state headers) but below the settings drawer (z-index: 3) so the
    gear icon remains tappable mid-transition.
  */
  .cinematic-transition {
    position: fixed;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
  }

  /*
    The vertical bar — same visual as ExtractingState's bar (2px wide,
    --green-acid). We start at scaleY(0) so the timeline can grow it
    to 1.0 from the top, mirroring the indeterminate idle frame the
    user just saw.
  */
  .cinematic-transition__bar {
    width: 2px;
    height: 12rem;
    background: var(--green-acid);
    transform-origin: top center;
    transform: scaleY(0);
  }

  /*
    The collapsing HUD panel placeholder — sized to match ExtractingState's
    panel slot (~4rem × 12rem). The timeline collapses this via scale +
    translate + clip-path mask, so the only resting state visual is the
    border and a faint chrome.
  */
  .cinematic-transition__panel {
    width: 4rem;
    height: 12rem;
    border: 0.5px solid var(--hair);
    background: rgba(0, 0, 0, 0.4);
  }

  .cinematic-transition__panel-body {
    width: 100%;
    height: 100%;
  }

  /*
    The chat surface starts at opacity 0 + scale 0.96 so the timeline
    can settle it to opacity 1 + scale 1. The greeting text is rendered
    statically (no splitLineReveal here — the actual ReadyState owns
    the splitLineReveal on the real greeting; this is purely a visual
    stand-in for the materializing surface during the cross-fade).
  */
  .cinematic-transition__chat {
    width: min(36rem, calc(100vw - 4rem));
    display: flex;
    flex-direction: column;
    gap: 1rem;
    opacity: 0;
    transform: scale(0.96);
  }

  .cinematic-transition__greeting {
    margin: 0;
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.55;
    color: var(--bone-dim);
  }

  /*
    Composer placeholder — a thin bar suggesting the input that's about
    to materialize. No interaction; this is a visual cue only.
  */
  .cinematic-transition__composer-placeholder {
    height: 2.5rem;
    border: 0.5px solid var(--hair);
    background: rgba(0, 0, 0, 0.4);
  }

  /*
    Reduced-motion users never see this overlay (it unmounts on the
    same tick onComplete fires), but if a slow render somehow paints
    a frame, hold everything at its final visual state so no animation
    artifact is visible.
  */
  @media (prefers-reduced-motion: reduce) {
    .cinematic-transition__bar {
      transform: scaleY(1);
    }
    .cinematic-transition__chat {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
