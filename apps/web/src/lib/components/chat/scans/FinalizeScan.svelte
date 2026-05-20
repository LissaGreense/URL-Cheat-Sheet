<!--
  FinalizeScan — interior for the `finalize` sentinel tool (spec §5.2).

  Important: `finalize` is a CLIENT-SIDE sentinel tool. See
  `packages/agent/src/tools/finalize.ts` — it has `inputSchema` but no
  `execute`. The model fills `input.answer` (+ `input.citations`) and
  the SDK halts the loop via `stopWhen: hasToolCall('finalize')`. The
  client renders `part.input.answer` verbatim. There is no `output` to
  read — trying to render `part.output.answer` is a confusion footgun.

  Phase 1 chrome contract:
    - `part.state` drives the status pill:
      `input-streaming   → [ COMPILING ]` (compile in progress)
      `input-available   → [ COMPLETE ]`  (model finished)
      `output-available  → [ COMPLETE ]`  (rare for client-side tools)
      `output-error      → [ FAULTED ]`   (alarm tone + error glyph)
    - Answer text from `part.input?.answer`, split into one
      `<p class="finalize__line">` per `\n` so the per-line scramble
      observer can target each new line node.
    - Citations from `part.input?.citations`, bracketed footer when
      the array is non-empty.

  Phase 2 motion (Task 11):
    - `use:assembleCascade` drives the `.compile-bar` height to the
      `streamedChars / totalEstimatedChars` ratio and scrambles each
      new `.finalize__line` as it appears (~180ms).
    - `use:phosphorFlash` fires once when state transitions to
      `output-available` (no flash on `output-error` — spec §5.3
      "we do not celebrate failures").
-->
<script lang="ts">
  import type { ToolUIPart } from 'ai';
  import ScanCard from '../ScanCard.svelte';
  import { assembleCascade } from '../../../motion/assembleCascade';
  import { phosphorFlash } from '../../../motion/phosphorFlash';

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

  /**
   * Split the streamed answer into completed lines + a live tail. The
   * MutationObserver in `assembleCascade` captures `node.textContent`
   * at scramble time, so we only want to add a `.finalize__line` node
   * once its text is final. We treat newline as the line-completion
   * signal and render the still-growing remainder as a separate
   * `.finalize__tail` element (no scramble — it's mutating live).
   *
   * Examples:
   *   ''             → lines=[],            tail=''
   *   'foo'          → lines=[],            tail='foo'
   *   'foo\n'        → lines=['foo'],       tail=''
   *   'foo\nbar'     → lines=['foo'],       tail='bar'
   *   'foo\nbar\nb'  → lines=['foo','bar'], tail='b'
   *
   * On the final paint (state === 'input-available' | 'output-available'),
   * any remaining tail content is rolled into the lines list so the
   * very last paragraph still gets a `.finalize__line` node (and the
   * scramble, since the observer fires on its first appearance).
   */
  const isFinal = $derived(part.state === 'input-available' || part.state === 'output-available');
  const segments = $derived.by<{ lines: string[]; tail: string }>(() => {
    if (answer.length === 0) return { lines: [], tail: '' };
    const parts = answer.split('\n');
    if (isFinal) return { lines: parts, tail: '' };
    // Streaming: last segment is the live tail.
    const linesOnly = parts.slice(0, -1);
    const tail = parts[parts.length - 1] ?? '';
    return { lines: linesOnly, tail };
  });

  /**
   * `streamedChars` — current count, fed into `assembleCascade`. The
   * action computes ratio = streamed / total internally.
   */
  const streamedChars = $derived(answer.length);

  /**
   * `totalEstimatedChars` — running max of `streamedChars` seen so far,
   * plus a 200-char buffer (spec §5.2 heuristic: "final answers are
   * usually <2000 chars, this gives the bar room to grow"). Tracking
   * the running max keeps the bar from visibly retreating when the
   * stream's denominator changes shape.
   *
   * `$state` here is intentional — we want a single piece of mutable
   * state that grows monotonically across `$effect` runs as new chunks
   * arrive. Reset to 0 if the answer is cleared (rare but cheap to handle).
   */
  let totalEstimatedChars = $state(0);
  $effect(() => {
    const target = streamedChars + 200;
    if (target > totalEstimatedChars) {
      totalEstimatedChars = target;
    }
  });

  /**
   * Phosphor-flash trigger — fires once on the "compile complete"
   * moment per spec §5.2. For client-side sentinel tools like
   * `finalize`, that moment is `input-available` (the model finished
   * filling the input); `output-available` exists too but is rare
   * for sentinels — both map to COMPLETE in the status pill, so both
   * are valid flash moments. We do NOT flash on `output-error`
   * (spec §5.3: "no phosphorFlash on failures; we do not celebrate
   * failures"). The trigger is a stable scalar so the action only
   * re-fires when the visible state genuinely transitions.
   */
  const isComplete = $derived(
    part.state === 'input-available' || part.state === 'output-available'
  );
  const phosphorTrigger = $derived(isComplete ? 'done' : 'pending');
  const shouldPhosphorFlash = $derived(isComplete);
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
  <!--
    Host for the compile-bar + per-line scramble. `assembleCascade` looks
    up a `.compile-bar` descendant + a `.finalize__content` text container
    (the per-line MutationObserver target). The action's `update` re-runs
    whenever `streamedChars` or `totalEstimatedChars` change.
  -->
  <div
    class="finalize"
    data-state={part.state}
    use:assembleCascade={{ streamedChars, totalEstimatedChars }}
  >
    <!--
      Compile bar — `.compile-bar` is the canonical selector
      `assembleCascade` looks up. We also keep `.finalize__bar` for the
      sake of any existing CSS chains. `phosphorFlash` fires once on
      `output-available` (spec §5.2); we gate the action via {#if} so
      it doesn't apply on failure states (no celebration of failures).
    -->
    {#if shouldPhosphorFlash}
      <div
        class="finalize__bar compile-bar"
        aria-hidden="true"
        use:phosphorFlash={{ trigger: phosphorTrigger }}
      ></div>
    {:else}
      <div class="finalize__bar compile-bar" aria-hidden="true"></div>
    {/if}

    <div class="finalize__content">
      {#each segments.lines as line, i (i)}
        <p class="finalize__answer finalize__line">{line}</p>
      {/each}

      {#if segments.tail.length > 0}
        <p class="finalize__answer finalize__tail">{segments.tail}</p>
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

  /*
    Compile bar — spec §5.2. Width is fixed at 2px; height is driven by
    `assembleCascade` (GSAP `gsap.to({ height: '<n>%' })`). We start at
    0% height so the bar grows from the top as the stream arrives.

    `align-self: flex-start` makes the bar grow downward from the top
    of the flex row rather than centering — without it, an explicit
    `height: 25%` would render the bar centered vertically in its
    track which looks wrong for a "compile" indicator.
  */
  .finalize__bar {
    flex: 0 0 2px;
    height: 0%;
    background: var(--green-acid);
    box-shadow: 0 0 18px var(--green-acid);
    align-self: flex-start;
  }

  /*
    Failure / cancellation per spec §5.3. The host's [data-state]
    attribute selector reaches the bar so the action can leave its
    height alone and the visual still reads as "frozen + dimmed".
  */
  .finalize[data-state='output-error'] .finalize__bar {
    opacity: 0.3;
  }

  /* Halted scan leaves the bar at its last position (no override). */

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
