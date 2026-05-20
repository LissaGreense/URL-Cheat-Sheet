<!--
  ReadLinesScan — interior for `read_lines` tool calls (spec §5.5
  future-tools rule: every shipped tool gets a deliberate scan
  vocabulary).

  The `read_lines` tool (see `packages/agent/src/tools/read-lines.ts`)
  accepts `{ start: number; end: number }` and returns
  `{ text: string; truncated: boolean }`. Returned text is already
  prefixed `Lxx | ` per line — we render it verbatim in a monospace
  block.

  Chrome contract:
    - Header: `// READ_LINES` via ScanCard
    - Status pill text:
        `input-streaming`  → READING (range not yet locked in)
        `input-available`  → `L<start>–L<end>` (range pinned, output pending)
        `output-available` → `L<start>–L<end>` (output arrived; or
          EMPTY_RANGE when the tool returned an empty span)
        `output-error`     → FAULTED (alarm + error glyph)
    - Interior: code-block style `<pre>` with the returned text,
      monospace, line-number prefixes preserved as the tool emitted
      them.

  No GSAP-driven sweep — `read_lines` is a read-only structural tool
  like `outline`; chrome is static per ADR 0009 (no motion to gate).
-->
<script lang="ts">
  import ScanCard from '../ScanCard.svelte';

  /**
   * Props for ReadLinesScan.
   * @property {number | null} start - 1-based inclusive start line. Null
   *   while the input is still streaming.
   * @property {number | null} end - 1-based inclusive end line. Null
   *   while the input is still streaming.
   * @property {string | null} text - The `Lxx | ...` prefixed text the
   *   tool returned. Null until output arrives.
   * @property {boolean} truncated - True when the requested span
   *   exceeded MAX_LINES and the tool capped it. Surfaced as a footer
   *   sys-voice note so the user knows the snippet is partial.
   * @property {string} state - The `ToolUIPart` state string.
   */
  type Props = {
    start: number | null;
    end: number | null;
    text: string | null;
    truncated: boolean;
    state: string;
  };

  let { start, end, text, truncated, state }: Props = $props();

  /**
   * Detect "empty range" — both endpoints landed AND the returned text
   * is the empty string. `read_lines` returns `{ text: '' }` for
   * out-of-range / inverted ranges (see `read-lines.ts`), and we want
   * the pill to read EMPTY_RANGE rather than the literal `L<start>–L<end>`
   * coordinate in that case.
   */
  const isEmpty = $derived(state === 'output-available' && (text ?? '').length === 0);

  /**
   * Status pill text. Mirrors GrepDocScan's $derived.by switch.
   */
  const status = $derived.by(() => {
    switch (state) {
      case 'input-streaming':
        return 'READING';
      case 'input-available':
        return start != null && end != null ? `L${start}–L${end}` : 'READING';
      case 'output-available':
        if (isEmpty) return 'EMPTY_RANGE';
        return start != null && end != null ? `L${start}–L${end}` : 'COMPLETE';
      case 'output-error':
        return 'FAULTED';
      default:
        return 'READING';
    }
  });

  const tone = $derived.by<'normal' | 'alarm' | 'dim'>(() => {
    if (state === 'output-error') return 'alarm';
    if (isEmpty) return 'dim';
    return 'normal';
  });
</script>

<ScanCard
  toolName="READ_LINES"
  {status}
  statusTone={tone}
  ticks={state === 'input-streaming' || state === 'input-available' || state === 'output-available'}
  errorGlyph={state === 'output-error'}
>
  <div class="read-lines" data-state={state}>
    {#if state === 'output-available' && text != null && text.length > 0}
      <pre class="read-lines__text">{text}</pre>
      {#if truncated}
        <p class="read-lines__truncated">[ truncated — span exceeded max ]</p>
      {/if}
    {:else if state === 'output-available' && isEmpty}
      <p class="read-lines__empty">empty range</p>
    {/if}
  </div>
</ScanCard>

<style>
  .read-lines {
    position: relative;
    min-height: 1.5rem;
  }

  /*
    Monospace code block — preserves the tool's `Lxx | ` prefix
    alignment. `white-space: pre` keeps long lines from wrapping mid-
    coordinate (the model often cites a specific `Lxx`, so wrapping
    would obscure which line the prefix belongs to). Overflow scrolls
    horizontally rather than reflowing.
  */
  .read-lines__text {
    margin: 0;
    padding: 0.5rem 0;
    font-family: var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--bone);
    white-space: pre;
    overflow-x: auto;
    overflow-y: hidden;
  }

  /*
    Truncation footer — sys-voice register so it reads as an instrument
    note, not part of the snippet.
  */
  .read-lines__truncated {
    margin: 0.5rem 0 0;
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--bone-dim);
  }

  /*
    Empty-range branch — same sys-voice register as the truncation
    footer so a missed range reads as an explicit "tool returned
    nothing" rather than a blank card.
  */
  .read-lines__empty {
    margin: 0;
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--bone-dim);
  }
</style>
