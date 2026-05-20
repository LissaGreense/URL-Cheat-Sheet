<!--
  FinalizeScan — Phase 1 static interior for the `finalize` sentinel
  tool (spec §5.2, plan Task 5).

  Important: `finalize` is a CLIENT-SIDE sentinel tool. See
  `packages/agent/src/tools/finalize.ts` — it has `inputSchema` but no
  `execute`. The model fills `input.answer` (+ `input.citations`) and
  the SDK halts the loop via `stopWhen: hasToolCall('finalize')`. The
  client renders `part.input.answer` verbatim. There is no `output` to
  read — trying to render `part.output.answer` is a confusion footgun.

  Phase 1 contract:
    - `part.state` drives the status pill:
      `input-streaming   → [ COMPILING ]` (compile in progress)
      `input-available   → [ COMPLETE ]`  (model finished)
      `output-available  → [ COMPLETE ]`  (rare for client-side tools)
      `output-error      → [ FAULTED ]`   (alarm tone + error glyph)
    - Answer text from `part.input?.answer`, body sans, multi-line.
    - Citations from `part.input?.citations`, bracketed footer when
      the array is non-empty.

  No compile-bar animation in Phase 1 — Phase 2 Task 11 adds it.
-->
<script lang="ts">
  import type { ToolUIPart } from 'ai';
  import ScanCard from '../ScanCard.svelte';

  /**
   * Props for FinalizeScan.
   * @property {ToolUIPart} part - The `tool-finalize` UI part from the
   *   chat. Narrowed at runtime — caller is responsible for routing
   *   only `tool-finalize` parts here.
   */
  type Props = { part: ToolUIPart };

  let { part }: Props = $props();

  // `part.input` is typed as `unknown` from the wide ToolUIPart union —
  // narrow it locally so the template reads cleanly.
  type FinalizeInput = { answer?: string; citations?: string[] } | undefined;
  const input = $derived(part.input as FinalizeInput);

  /**
   * Map the part's stream state to the visible status string. v6 of
   * `ai` exposes `input-streaming`, `input-available`, `output-available`,
   * `output-error`, `output-denied` (see `node_modules/ai/dist/index.d.mts`
   * line 1734). For a client-side sentinel tool we mostly see the first
   * three; everything else falls back to `PENDING` to keep the chrome
   * predictable.
   */
  const status = $derived.by(() => {
    switch (part.state) {
      case 'input-streaming':
        return 'COMPILING';
      case 'input-available':
      case 'output-available':
        return 'COMPLETE';
      case 'output-error':
        return 'FAULTED';
      default:
        return 'PENDING';
    }
  });

  const tone = $derived.by<'normal' | 'alarm' | 'dim'>(() => {
    if (part.state === 'output-error') return 'alarm';
    if (part.state === 'input-streaming') return 'dim';
    return 'normal';
  });

  const answer = $derived(input?.answer ?? '');
  const citations = $derived(input?.citations ?? []);
</script>

<ScanCard
  toolName="FINALIZE"
  {status}
  statusTone={tone}
  ticks={part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    part.state === 'output-available'}
  errorGlyph={part.state === 'output-error'}
>
  <div class="finalize">
    <!--
      Compile bar — static at 100% height in Phase 1 (spec §5.2 motion
      arrives in Phase 2). Keeping the DOM node here so Phase 2's
      action has a target selector.
    -->
    <div class="finalize__bar" aria-hidden="true"></div>

    <div class="finalize__content">
      {#if answer}
        <p class="finalize__answer">{answer}</p>
      {/if}

      {#if citations.length > 0}
        <p class="finalize__citations">[ citations: {citations.join(', ')} ]</p>
      {/if}
    </div>
  </div>
</ScanCard>

<style>
  /*
    Card interior: the compile bar pinned left, content flowing right.
    Phase 1 the bar is a static 100%-tall block; Phase 2 will animate
    its `height` against streamed_chars / total_estimated_chars.
  */
  .finalize {
    position: relative;
    display: flex;
    gap: 1rem;
    align-items: stretch;
    min-height: 2rem;
  }

  .finalize__bar {
    flex: 0 0 2px;
    background: var(--green-acid);
    box-shadow: 0 0 18px var(--green-acid);
    /* Phase 1: static. Phase 2 animates `height` from 0 → 100%. */
  }

  .finalize__content {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  /*
    Answer text — body sans, multi-line, preserves whitespace so any
    paragraph breaks in `input.answer` survive.
  */
  .finalize__answer {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.9375rem;
    line-height: 1.55;
    color: var(--bone);
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  /*
    Citations footer — sys-voice register (small caps, wide tracking)
    so it reads as instrument-data and not as part of the prose.
  */
  .finalize__citations {
    margin: 0;
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--bone-dim);
  }
</style>
