<!--
  OutlineScan — interior for `outline` tool calls (spec §5.5 future-tools
  rule: every shipped tool gets a deliberate scan vocabulary).

  The `outline` tool (see `packages/agent/src/tools/outline.ts`) returns
  the document's heading structure: `{ headings: Heading[] }`, where each
  `Heading` is `{ text: string; level: 1-6; line: number }` (schema in
  `packages/schemas/src/extract.ts`).

  Chrome contract:
    - Header: `// OUTLINE` via ScanCard
    - Status pill text:
        `input-streaming`  → SCANNING (no count yet)
        `input-available`  → SCANNING (input arrived; output pending)
        `output-available` → `<n> SECTIONS` (or NO_SECTIONS for n=0)
        `output-error`     → FAULTED (alarm tone + error glyph)
    - Interior: tree-list of headings, indented per `level`, each line
      prefixed `L<line>` (e.g. `L42  ## API Reference`).

  No GSAP-driven sweep — `outline` is a read-only structural tool, the
  chrome is intentionally static (ADR 0009 strict fallback: no motion
  to gate). If a one-shot reveal animation is added later it must
  consult `prefersReducedMotion()`.
-->
<script lang="ts">
  import ScanCard from '../ScanCard.svelte';

  /**
   * Heading shape — kept structural here so MessageStream can pass
   * defensively-narrowed objects without importing the schemas
   * package. The actual schema lives in
   * `packages/schemas/src/extract.ts` (`headingSchema`).
   */
  export type OutlineHeading = {
    text: string;
    level: number;
    line: number;
  };

  /**
   * Props for OutlineScan.
   * @property {OutlineHeading[]} headings - The heading list returned
   *   by the tool. Empty array is the "no sections" branch and drives
   *   the `NO_SECTIONS` pill text.
   * @property {string} state - The `ToolUIPart` state string
   *   (`input-streaming` / `input-available` / `output-available` /
   *   `output-error`). Passed through directly so the pill text +
   *   tone derive locally.
   */
  type Props = {
    headings: OutlineHeading[];
    state: string;
  };

  let { headings, state }: Props = $props();

  /**
   * Status pill text. Mirrors the pattern in GrepDocScan / FinalizeScan
   * — single $derived.by switch on `state` with the count interpolated
   * for the success branch.
   */
  const status = $derived.by(() => {
    switch (state) {
      case 'output-available':
        return headings.length === 0 ? 'NO_SECTIONS' : `${headings.length} SECTIONS`;
      case 'output-error':
        return 'FAULTED';
      default:
        return 'SCANNING';
    }
  });

  const tone = $derived.by<'normal' | 'alarm' | 'dim'>(() => {
    if (state === 'output-error') return 'alarm';
    if (state === 'output-available' && headings.length === 0) return 'dim';
    return 'normal';
  });

  /**
   * Build the `#` prefix for a heading level — `##` for level 2,
   * `###` for level 3, etc. Mirrors Markdown convention so the visible
   * tree reads as `L42  ## Header`. Levels outside 1-6 fall back to a
   * single `#` defensively.
   */
  function levelPrefix(level: number): string {
    if (!Number.isFinite(level) || level < 1) return '#';
    const n = Math.min(Math.max(Math.floor(level), 1), 6);
    return '#'.repeat(n);
  }
</script>

<ScanCard
  toolName="OUTLINE"
  {status}
  statusTone={tone}
  ticks={state === 'input-streaming' || state === 'input-available' || state === 'output-available'}
  errorGlyph={state === 'output-error'}
>
  <div class="outline" data-state={state}>
    {#if state === 'output-available' && headings.length > 0}
      <ol class="outline__list">
        {#each headings as heading, i (i)}
          <li
            class="outline__item"
            style:padding-left="{Math.max(0, heading.level - 1)}rem"
            data-level={heading.level}
          >
            <span class="outline__line">L{heading.line}</span>
            <span class="outline__prefix">{levelPrefix(heading.level)}</span>
            <span class="outline__text">{heading.text}</span>
          </li>
        {/each}
      </ol>
    {:else if state === 'output-available' && headings.length === 0}
      <p class="outline__empty">no sections</p>
    {/if}
  </div>
</ScanCard>

<style>
  /*
    Static interior — no motion to gate per ADR 0009. The list itself is
    the load-bearing content; the only chrome decision is rhythm +
    monospace alignment for the `Lxx` line numbers.
  */
  .outline {
    position: relative;
    min-height: 1.5rem;
  }

  .outline__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  /*
    Per-row layout: line number + `#` prefix + heading text. Each row
    keeps its own padding-left (set inline above) so the level tree
    reads visually without nesting <ol>s.
  */
  .outline__item {
    display: flex;
    align-items: baseline;
    gap: 0.5ch;
    font-family: var(--font-body);
    font-size: 0.875rem;
    line-height: 1.4;
    color: var(--bone);
  }

  /*
    Line number — fixed-ish width, dim color so it reads as an
    instrument coordinate rather than load-bearing prose.
  */
  .outline__line {
    flex: 0 0 auto;
    min-width: 4ch;
    color: var(--bone-dim);
    font-variant-numeric: tabular-nums;
  }

  /*
    `#` glyph cluster — same dim register as the line number. Spec §2.2
    sys-voice: instrument punctuation in --bone-dim so the heading
    `text` reads as the foreground.
  */
  .outline__prefix {
    flex: 0 0 auto;
    color: var(--bone-dim);
  }

  .outline__text {
    flex: 1 1 auto;
    color: var(--bone);
  }

  /*
    No-sections branch — sys-voice register so it reads as a status
    line rather than absent content.
  */
  .outline__empty {
    margin: 0;
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--bone-dim);
  }
</style>
