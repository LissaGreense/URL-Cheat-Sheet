<!--
  GrepDocScan — interior for `grep_doc` tool calls (spec §5.1).

  Composes `ScanCard` with:
    - Header label `GREP_DOC`
    - Status pill derived from the `state` prop (see `status` below)
    - Glyph-grid backdrop (CSS-only — inline SVG-noise data URI at 8%
      opacity, dimmed to 4% on completion per spec §5.1)
    - Query string under a `q: "..."` prefix
    - Phase 2 (Task 11): scanline sweep across the backdrop via the
      `scanSweep` action, keyed off the `state` prop so it re-fires
      on transitions into `'scanning'`.
-->
<script lang="ts">
  import ScanCard from '../ScanCard.svelte';
  import { scanSweep } from '../../../motion/scanSweep';

  /**
   * Props for GrepDocScan.
   * @property {string} query - The search term the model issued. Rendered
   *   verbatim inside `q: "..."` — caller is responsible for any
   *   normalization (trimming, casing).
   * @property {number | null | undefined} [hits] - Hit count, used only
   *   when `state === 'done'`. Falsy or missing renders as `0 HITS` for
   *   `done`; for other states the count is ignored.
   * @property {'pending' | 'scanning' | 'done' | 'no-hits' | 'faulted' | 'halted'} state
   *   Drives the status pill text + tone + error glyph.
   */
  type GrepState = 'pending' | 'scanning' | 'done' | 'no-hits' | 'faulted' | 'halted';
  type Props = {
    query: string;
    hits?: number | null;
    state: GrepState;
  };

  let { query, hits = null, state }: Props = $props();

  /**
   * Derive the status text shown in the pill. `done` injects the hit
   * count; everything else maps to a literal sys-voice label.
   */
  const status = $derived.by(() => {
    switch (state) {
      case 'pending':
      case 'scanning':
        return 'SCANNING';
      case 'done':
        return `${hits ?? 0} HITS`;
      case 'no-hits':
        return 'NO_HITS';
      case 'faulted':
        return 'FAULTED';
      case 'halted':
        return 'HALTED';
    }
  });

  /**
   * Status color tone. Alarm for faulted, dim for halted/no-hits/pending,
   * normal for active scans + completed-with-hits.
   */
  const tone = $derived.by<'normal' | 'alarm' | 'dim'>(() => {
    if (state === 'faulted') return 'alarm';
    if (state === 'halted' || state === 'no-hits' || state === 'pending') return 'dim';
    return 'normal';
  });

  /**
   * Backdrop dim flag — spec §5.1 says the glyph-grid drops from 8% to
   * 4% opacity once the scan is "complete" (done OR no-hits). Faulted
   * and halted scans dim too (per spec §5.3, faulted dims to 30%; we
   * encode that as a separate `--faulted` modifier in CSS).
   */
  const backdropClass = $derived.by(() => {
    const base = 'grep-doc__backdrop';
    if (state === 'done' || state === 'no-hits') return `${base} ${base}--dim`;
    if (state === 'faulted') return `${base} ${base}--faulted`;
    if (state === 'halted') return `${base} ${base}--halted`;
    return base;
  });

  /**
   * scanSweep trigger — `null` when the card is not in an actively-
   * scanning state. The scanSweep action skips its mount-fire when
   * the trigger is nullish, so:
   *   - mount in 'pending' → trigger=null → no sweep on first paint.
   *   - 'pending' → 'scanning' → trigger='active' → sweep fires.
   *   - 'scanning' → 'done' → trigger=null → action update no-ops
   *     (backdrop dims via the `--dim` class; no rewind sweep).
   *   - 'scanning' → 'faulted' → trigger=null → action update no-ops;
   *     the `[data-state='faulted']` CSS pins the scanline opacity at
   *     0.3 (the spec's "frozen mid-motion dimmed to 30%"; in practice
   *     the GSAP timeline has already advanced by the time the error
   *     lands, so we accept "frozen at end-of-tween" as the visual
   *     equivalent under jsdom).
   *   - mount in 'done' (historic chat replay) → trigger=null → no
   *     sweep on completed cards. Backdrop renders dimmed via the
   *     class. This is the key UX win — scrolling through history
   *     doesn't replay every sweep.
   */
  const sweepTrigger: 'active' | null = $derived(state === 'scanning' ? 'active' : null);
</script>

<ScanCard
  toolName="GREP_DOC"
  {status}
  statusTone={tone}
  ticks={state === 'scanning' || state === 'done'}
  errorGlyph={state === 'faulted'}
>
  <!--
    Host for the scanline action — `use:scanSweep` looks up a
    `.scan-sweep__line` descendant. We pass the `state` prop as the
    `trigger` so the sweep re-fires every time the scan transitions
    (notably into `'scanning'`). Per spec §5.3, the action itself does
    not branch on faulted/halted — those are visual classes layered on
    the backdrop + scanline by the parent (see CSS below).
  -->
  <div class="grep-doc" use:scanSweep={{ trigger: sweepTrigger }}>
    <div class={backdropClass} aria-hidden="true"></div>
    <div class="scan-sweep__line" data-state={state} aria-hidden="true"></div>
    <p class="grep-doc__query">
      <span class="grep-doc__query-prefix">q:</span>
      <span class="grep-doc__query-text">"{query}"</span>
    </p>
  </div>
</ScanCard>

<style>
  /*
    The interior is a single block: a faint glyph-grid backdrop layer
    (absolute, behind everything) + the query line on top. The backdrop
    is the surface Phase 2's scanline sweep will travel over.
  */
  .grep-doc {
    position: relative;
    min-height: 4rem;
    padding: 0.5rem 0;
  }

  /*
    Glyph-grid backdrop — inline SVG-noise data URI at 8% opacity in
    --bone-dim, per spec §5.1. The SVG renders a 24x8 grid of small
    glyph-shaped marks; jsdom does not paint it but the element is
    present for the scanline action to target.

    On completion, the backdrop dims to 4% (spec §5.1). On faulted, the
    spec says the *scanline / compile bar* dims to 30% — the backdrop
    itself doesn't dim further; we still toggle a class so future styling
    has a hook. On halted, the backdrop stays where it was.
  */
  .grep-doc__backdrop {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.08;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='32' viewBox='0 0 96 32'><g fill='rgb(232,232,230)' font-family='monospace' font-size='8'><text x='0' y='8'>0 1 . | _ -</text><text x='0' y='16'>+ = : / &gt; &lt;</text><text x='0' y='24'>_ - + 0 . |</text></g></svg>");
    background-repeat: repeat;
    transition: opacity var(--dur-enter, 500ms) var(--ease-out-expo, ease-out);
  }

  .grep-doc__backdrop--dim {
    opacity: 0.04;
  }

  /*
    Scanline child — a 1px horizontal bar in --green-acid with a soft
    glow. `top: 0%` is the resting (pre-sweep) position; the action
    drives `top` to 100% during the sweep. `opacity: 0` keeps it
    invisible until the timeline kicks in (and matches the reduced-motion
    fallback the action writes when motion is disabled).
  */
  .scan-sweep__line {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 1px;
    background: var(--green-acid);
    box-shadow: 0 0 12px var(--green-acid);
    opacity: 0;
    pointer-events: none;
  }

  /*
    Faulted scan — spec §5.3 freezes the scanline mid-motion at 30%
    opacity. The action keeps the GSAP tween position when state
    transitions to 'faulted' (no kill — the tween simply doesn't
    advance because nothing changes the trigger), and the `[data-state]`
    attribute selector here pins the visible intensity.
  */
  .scan-sweep__line[data-state='faulted'] {
    opacity: 0.3;
  }

  /*
    Halted scan — spec §5.3 says the bar stays at its last position.
    No declarations: whatever opacity the action left behind stays.
    We keep the attribute in the markup so future styling (e.g. a
    tone tint) can hang off it without rewiring the template.
  */

  /*
    Query line — body sans, sits above the backdrop. The `q:` prefix
    uses --bone-dim so the value reads as the load-bearing text.
  */
  .grep-doc__query {
    position: relative;
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--bone);
  }

  .grep-doc__query-prefix {
    color: var(--bone-dim);
    margin-right: 0.5ch;
  }

  .grep-doc__query-text {
    color: var(--bone);
  }
</style>
