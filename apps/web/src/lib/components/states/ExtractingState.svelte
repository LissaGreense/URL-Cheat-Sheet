<!--
  ExtractingState — the cinematic "ingest in progress" screen
  (spec §4.2, plan Task 3).

  Phase 1 contract (no exit transition — that's Phase 2 / Task 13):
    - `// INGESTING_SOURCE` top-left header (via fixed-position wrapper).
    - URL truncated to 56 chars in body sans below the header.
    - `<HudPanel>` containing a vertical bar that grows indeterminately
      via scoped `@keyframes` (the one Task 3 motion carve-out — no GSAP,
      no Svelte actions).
    - `[ READING ]` status pill.
    - `001 SESSION` persistent corner stamp.
-->
<script lang="ts">
  import HudPanel from '../hud/HudPanel.svelte';
  import StatusPill from '../hud/StatusPill.svelte';
  import SysLabel from '../hud/SysLabel.svelte';
  import CornerStamp from '../hud/CornerStamp.svelte';
  import { scrambleIn } from '../../motion/scrambleIn';

  /**
   * Props for ExtractingState.
   * @property {string} url - The URL currently being ingested. Rendered
   *   verbatim when ≤56 chars; otherwise truncated to `slice(0, 53) + '...'`
   *   so the displayed string always fits in 56 columns.
   */
  type Props = { url: string };

  let { url }: Props = $props();

  /**
   * Truncate the URL display to 56 characters. Anything longer than 56
   * chars renders as the first 53 chars + `...`, so the on-screen line
   * never exceeds 56 columns (spec §4.2: "URL truncated to 56 chars").
   */
  const displayUrl = $derived(url.length > 56 ? url.slice(0, 53) + '...' : url);
</script>

<CornerStamp text="001 SESSION" position="bottom-right" />

<div class="extracting-header">
  <SysLabel kind="header">INGESTING_SOURCE</SysLabel>
</div>

<div class="extracting-state">
  <!--
    `scrambleIn` on the URL — spec §4.2 calls for "subtle scramble-text
    on the URL during ingest". The action owns the element's text
    content per the ucs-eem managed-content contract (passes the
    target via `text:`, not as a Svelte child). Under reduced-motion
    the action writes the text synchronously without GSAP, so the URL
    is visible immediately for those users.
  -->
  <p class="extracting-url" data-testid="extracting-url" use:scrambleIn={{ text: displayUrl }}></p>

  <HudPanel ticks={true}>
    <div class="extracting-panel-body">
      <div class="extracting-bar" aria-hidden="true"></div>
    </div>
  </HudPanel>

  <StatusPill state="READING" />
</div>

<style>
  /*
    Layout mirrors IdleState — centered column, top-left fixed header,
    bottom-right corner stamp. Vertical rhythm tightens here so the
    bar feels active.
  */
  .extracting-state {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 4rem 2rem;
    gap: 1.5rem;
  }

  .extracting-header {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 1;
  }

  /*
    URL display — body sans (spec §4.2 calls this out explicitly).
    Kept narrow + centered so the truncated form (`...`-suffixed) reads
    as a label, not a paragraph.
  */
  .extracting-url {
    font-family: var(--font-body);
    font-size: 0.875rem;
    line-height: 1.4;
    letter-spacing: 0.02em;
    color: var(--bone-dim);
    margin: 0;
    max-width: 56ch;
    text-align: center;
    word-break: break-all;
  }

  /*
    Panel body holds the vertical bar. Width is tied to a fixed pixel
    column; height is the bar's animated property — spec §4.2 says
    "grows top-to-bottom" which is read as a loop in Phase 1 (the
    determinate completion is part of the Phase 2 cinematic exit).
  */
  .extracting-panel-body {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: 4rem;
    height: 12rem;
  }

  /*
    The bar itself — a thin vertical column in `--green-acid`. The
    `@keyframes` loop scales its height between 0 and 1 against the
    parent's 12rem cap; transform-origin top so it reads as growing
    downward (per spec language). This is the only motion this Phase 1
    component owns (Task 3 carve-out).
  */
  .extracting-bar {
    width: 2px;
    height: 100%;
    background: var(--green-acid);
    transform-origin: top center;
    animation: extracting-bar-grow 1.6s var(--ease-out-soft) infinite;
  }

  @keyframes extracting-bar-grow {
    0% {
      transform: scaleY(0);
      opacity: 0.6;
    }
    50% {
      transform: scaleY(1);
      opacity: 1;
    }
    100% {
      transform: scaleY(0);
      opacity: 0.6;
    }
  }

  /*
    Respect prefers-reduced-motion. The bar still renders (the visual
    contract is "vertical bar is present" — see ExtractingState tests),
    just held at full height with no animation.
  */
  @media (prefers-reduced-motion: reduce) {
    .extracting-bar {
      animation: none;
      transform: scaleY(1);
      opacity: 1;
    }
  }
</style>
