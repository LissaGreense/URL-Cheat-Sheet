<!--
  GrepDocScan — Phase 1 static interior for `grep_doc` tool calls
  (spec §5.1, plan Task 5).

  Composes `ScanCard` with:
    - Header label `GREP_DOC`
    - Status pill derived from the `state` prop (see `statusFor` below)
    - Glyph-grid backdrop (CSS-only — inline SVG-noise data URI at 8%
      opacity)
    - Query string under a `q: "..."` prefix

  No animation in Phase 1. Phase 2 Task 11 layers the scanline sweep
  on `.grep-doc__backdrop` via a Svelte action.
-->
<script lang="ts">
  import ScanCard from '../ScanCard.svelte';

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
</script>

<ScanCard
  toolName="GREP_DOC"
  {status}
  statusTone={tone}
  ticks={state === 'scanning' || state === 'done'}
  errorGlyph={state === 'faulted'}
>
  <div class="grep-doc">
    <div class="grep-doc__backdrop" aria-hidden="true"></div>
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
    present for the Phase 2 scanline action to target.
  */
  .grep-doc__backdrop {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.08;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='32' viewBox='0 0 96 32'><g fill='rgb(232,232,230)' font-family='monospace' font-size='8'><text x='0' y='8'>0 1 . | _ -</text><text x='0' y='16'>+ = : / &gt; &lt;</text><text x='0' y='24'>_ - + 0 . |</text></g></svg>");
    background-repeat: repeat;
  }

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
