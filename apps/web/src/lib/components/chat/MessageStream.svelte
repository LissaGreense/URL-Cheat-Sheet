<!--
  MessageStream — the assistant-thread renderer (spec §4.5, plan
  Task 5).

  ## Reactivity contract (load-bearing)

  This component takes the full `Chat` instance and reads
  `chat.messages` directly inside the template. Destructuring at the
  prop boundary (e.g. accepting `messages: ReadonlyArray<UIMessage>`
  from `chat.messages` in the parent) reads the value ONCE at render
  time and loses Svelte 5 reactivity for incoming SSE tokens —
  observable as the thread freezing mid-stream. Do NOT change the prop
  signature without also moving the SSE-driven reads.

  ## Rendering rules

  - User messages: right-aligned, body sans, `> ` sys-voice prefix in
    --green-acid micro-caps.
  - Assistant messages: left-aligned, body sans, no role label.
  - Part routing:
    - `type === 'text'`           → body sans paragraph
    - `type === 'tool-grep_doc'`  → `<GrepDocScan>`
    - `type === 'tool-finalize'`  → `<FinalizeScan>`
    - `type === 'tool-outline'`   → `<OutlineScan>`
    - `type === 'tool-read_lines'`→ `<ReadLinesScan>`
    - Any other tool-* type       → render nothing (spec §5.5: every
      shipped tool must have a deliberate scan vocabulary; the strict
      production rule is "no debug JSON fallback", so unknown tools
      paint nothing silently — adding console noise per part would
      reintroduce the per-turn warning storm ucs-8n1 captured).
  - When `awaitingAssistant` is true, append a sys-voice "Thinking…"
    placeholder below the thread (suppressed once the assistant
    message starts streaming).
-->
<script lang="ts">
  import type { Chat } from '@ai-sdk/svelte';
  import type { ToolUIPart } from 'ai';
  import SysLabel from '../hud/SysLabel.svelte';
  import GrepDocScan from './scans/GrepDocScan.svelte';
  import FinalizeScan from './scans/FinalizeScan.svelte';
  import OutlineScan from './scans/OutlineScan.svelte';
  import ReadLinesScan from './scans/ReadLinesScan.svelte';

  /**
   * Props for MessageStream.
   * @property {Pick<Chat, 'messages'> & { status?: Chat['status'] }} chat -
   *   The live Chat instance (or a structural mock — see
   *   MessageStream.test-host.svelte). The component reads
   *   `chat.messages` and `chat.status` directly inside the template —
   *   see the file header for why this matters. `status` is optional
   *   on the structural surface so tests can pass duck-typed mocks
   *   without an `as any` cast at the boundary; a real `Chat` instance
   *   always provides it.
   * @property {boolean} awaitingAssistant - True when the user has
   *   submitted but no assistant message has appeared yet. Renders a
   *   sys-voice "Thinking…" placeholder below the thread.
   */
  type Props = {
    chat: Pick<Chat, 'messages'> & { status?: Chat['status'] };
    awaitingAssistant: boolean;
  };

  let { chat, awaitingAssistant }: Props = $props();

  /**
   * Narrow + extract grep_doc input/output for the GrepDocScan props.
   * The runtime shape of `part.input` is `{ query: string }` and
   * `part.output` (when state is `output-available`) carries the hit
   * count under whatever shape the tool returns. We compute the
   * GrepDocScan state from the part state defensively.
   */
  function grepStateFor(
    state: string
  ): 'pending' | 'scanning' | 'done' | 'no-hits' | 'faulted' | 'halted' {
    switch (state) {
      case 'input-streaming':
        return 'scanning';
      case 'input-available':
        return 'scanning';
      case 'output-available':
        return 'done';
      case 'output-error':
        return 'faulted';
      default:
        return 'pending';
    }
  }

  /**
   * Extract a hit count from a grep_doc `output` payload. The tool
   * returns an array of matches under `matches` (see
   * `packages/agent/src/tools/grep-doc.ts` — `execute` returns
   * `{ matches: GrepMatch[] }`). We accept a numeric `matches`
   * fallback too in case a future shape variant flattens the count.
   *
   * Schema-drift history: an earlier version of this helper read
   * `output.hits`, which silently became `0 HITS` on every card once
   * the tool actually shipped. ucs-ozi tracked the fix.
   */
  function hitsFor(output: unknown): number | null {
    if (!output || typeof output !== 'object') return null;
    const o = output as Record<string, unknown>;
    const matches = o['matches'];
    if (Array.isArray(matches)) return matches.length;
    if (typeof matches === 'number') return matches;
    return null;
  }

  /**
   * Extract the query string from a grep_doc `input` payload. The
   * tool schema (see `packages/agent/src/tools/grep-doc.ts`) accepts
   * `pattern: string | string[]` — the array form is the OR-union
   * synonym-exploration shape (ucs-0f3). We render a string verbatim
   * and join arrays with ` | ` to mirror the OR semantics. Fall back
   * to empty string if the model hasn't streamed the pattern yet.
   *
   * Schema-drift history: an earlier version read `input.query`,
   * which always undefined and silently rendered `q: ""`. ucs-aoo
   * tracked the fix.
   */
  function queryFor(input: unknown): string {
    if (!input || typeof input !== 'object') return '';
    const i = input as Record<string, unknown>;
    const p = i['pattern'];
    if (typeof p === 'string') return p;
    if (Array.isArray(p)) return p.filter((s): s is string => typeof s === 'string').join(' | ');
    return '';
  }

  /**
   * Detect whether an assistant message has emitted the `finalize`
   * sentinel tool. Used to suppress the per-message "Thinking…"
   * placeholder once the model has begun streaming its final answer.
   */
  function hasFinalize(parts: ReadonlyArray<{ type: string }>): boolean {
    return parts.some((p) => p.type === 'tool-finalize');
  }

  /**
   * Narrow a `tool-outline` part's output for OutlineScan props. The
   * tool's `execute` returns `{ headings: Heading[] }` (see
   * `packages/agent/src/tools/outline.ts`). We defensively shape-check
   * because the part's typed `output` is `unknown` on the wide
   * `ToolUIPart` union.
   *
   * Each heading carries `{ text: string; level: 1-6; line: number }`
   * — the schema is in `packages/schemas/src/extract.ts`. We don't
   * import the type here because the OutlineScan accepts the same
   * structural shape and validates it itself; keeping MessageStream
   * agnostic of the schema makes the routing layer cheap.
   */
  type OutlineHeading = { text: string; level: number; line: number };
  function headingsFor(output: unknown): OutlineHeading[] {
    if (!output || typeof output !== 'object') return [];
    const o = output as Record<string, unknown>;
    const headings = o['headings'];
    if (!Array.isArray(headings)) return [];
    return headings.filter((h): h is OutlineHeading => {
      if (!h || typeof h !== 'object') return false;
      const r = h as Record<string, unknown>;
      return (
        typeof r['text'] === 'string' &&
        typeof r['level'] === 'number' &&
        typeof r['line'] === 'number'
      );
    });
  }

  /**
   * Extract `{ start, end }` from a `tool-read_lines` input. The tool
   * input is `{ start: number; end: number }` (see
   * `packages/agent/src/tools/read-lines.ts`). Returns `null` for either
   * field if not yet streamed so ReadLinesScan can render a `READING`
   * pill without a range until the input lands.
   */
  function readLinesRangeFor(input: unknown): { start: number | null; end: number | null } {
    if (!input || typeof input !== 'object') return { start: null, end: null };
    const i = input as Record<string, unknown>;
    const start = typeof i['start'] === 'number' ? (i['start'] as number) : null;
    const end = typeof i['end'] === 'number' ? (i['end'] as number) : null;
    return { start, end };
  }

  /**
   * Extract `{ text, truncated }` from a `tool-read_lines` output. The
   * tool returns `{ text: string; truncated: boolean }` (see
   * `read-lines.ts`); we defensively check.
   */
  function readLinesOutputFor(output: unknown): { text: string; truncated: boolean } | null {
    if (!output || typeof output !== 'object') return null;
    const o = output as Record<string, unknown>;
    const text = o['text'];
    if (typeof text !== 'string') return null;
    const truncated = o['truncated'];
    return { text, truncated: truncated === true };
  }

  /**
   * Stable identity key for a message part. Tool parts get a guaranteed-
   * unique `toolCallId` from the AI SDK (one per tool invocation), so we
   * key by that whenever it's present. Non-tool parts (text, reasoning,
   * step-start) fall back to a composite of `message.id`, the index, and
   * `part.type` — the composite still produces stable keys across SSE
   * chunks because text parts are typically singletons within a message
   * and the index is the same across rerenders within a streaming turn.
   *
   * Why this matters (ucs-6j9 / hypothesis 3): the previous keying used
   * the bare loop index `(i)`. When the AI SDK appends new tool parts
   * mid-stream, Svelte's index-keyed each block reuses DOM nodes from
   * earlier mounts for later parts whose identity has changed. Actions
   * attached to those nodes (`scrambleIn`, `phosphorFlash`) see a same-
   * node-different-consumer transition that doesn't match their
   * lifecycle assumptions, so the visible pill text freezes at the
   * previous part's resting state. Keying by `toolCallId` gives Svelte a
   * stable identity to mount/dispose against, restoring the
   * one-action-per-logical-part contract.
   */
  function partKey(messageId: string, part: { type: string }, i: number): string {
    const toolCallId = (part as Record<string, unknown>)['toolCallId'];
    if (typeof toolCallId === 'string' && toolCallId.length > 0) return toolCallId;
    return `${messageId}:${i}:${part.type}`;
  }
</script>

<ol class="message-stream">
  {#each chat.messages as message (message.id)}
    <li
      class="message-stream__item"
      class:message-stream__item--user={message.role === 'user'}
      class:message-stream__item--assistant={message.role === 'assistant'}
    >
      {#if message.role === 'user'}
        <div class="message-stream__user">
          <span class="message-stream__user-prefix" aria-hidden="true">&gt;</span>
          {#each message.parts as part, i (partKey(message.id, part, i))}
            {#if part.type === 'text'}
              <p class="message-stream__text">{part.text}</p>
            {/if}
          {/each}
        </div>
      {:else}
        <div class="message-stream__assistant">
          {#each message.parts as part, i (partKey(message.id, part, i))}
            {#if part.type === 'text'}
              <p class="message-stream__text">{part.text}</p>
            {:else if part.type === 'tool-grep_doc'}
              <GrepDocScan
                query={queryFor((part as ToolUIPart).input)}
                hits={hitsFor((part as ToolUIPart & { output?: unknown }).output)}
                state={grepStateFor(part.state)}
              />
            {:else if part.type === 'tool-finalize'}
              <FinalizeScan part={part as ToolUIPart} />
            {:else if part.type === 'tool-outline'}
              <OutlineScan
                headings={headingsFor((part as ToolUIPart & { output?: unknown }).output)}
                state={part.state}
              />
            {:else if part.type === 'tool-read_lines'}
              {@const range = readLinesRangeFor((part as ToolUIPart).input)}
              {@const out = readLinesOutputFor((part as ToolUIPart & { output?: unknown }).output)}
              <ReadLinesScan
                start={range.start}
                end={range.end}
                text={out?.text ?? null}
                truncated={out?.truncated ?? false}
                state={part.state}
              />
            {/if}
            <!--
              Unknown tool-* types fall through silently. Spec §5.5
              requires every shipped tool to have a deliberate scan
              vocabulary — ship it or skip it. We do NOT log here:
              ucs-8n1 captured 210+ warnings in a single chat turn
              when this branch warned per-part.
            -->
          {/each}

          {#if !hasFinalize(message.parts) && (chat.status === 'submitted' || chat.status === 'streaming')}
            <p class="message-stream__thinking">
              <SysLabel kind="header">THINKING&hellip;</SysLabel>
            </p>
          {/if}
        </div>
      {/if}
    </li>
  {/each}

  {#if awaitingAssistant}
    <li class="message-stream__item message-stream__item--assistant message-stream__awaiting">
      <p class="message-stream__thinking">
        <SysLabel kind="header">THINKING&hellip;</SysLabel>
      </p>
    </li>
  {/if}
</ol>

<style>
  /*
    Thread shell — vertical column of messages, generous rhythm so
    tool-call cards have visual room without crowding text lines.
  */
  .message-stream {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .message-stream__item {
    display: flex;
    flex-direction: column;
  }

  /*
    User messages right-anchored — the line itself remains in the
    document flow but its inner block aligns right per spec §4.5
    ("User: right-aligned, body sans, no chrome").
  */
  .message-stream__item--user {
    align-items: flex-end;
  }

  .message-stream__user {
    display: flex;
    align-items: baseline;
    gap: 0.5ch;
    max-width: 80%;
    text-align: right;
  }

  /*
    `> ` prefix for user messages, --green-acid micro-caps per
    spec §4.5. Single literal `>` glyph, sys-voice register
    (small caps + wide tracking).
  */
  .message-stream__user-prefix {
    flex: 0 0 auto;
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    color: var(--green-acid);
  }

  /*
    Assistant messages left-aligned per spec §4.5 ("the absence of
    a prefix *is* the assistant"). No role label.
  */
  .message-stream__item--assistant {
    align-items: flex-start;
  }

  .message-stream__assistant {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 100%;
    width: 100%;
  }

  /*
    Message text — body sans, preserves whitespace so paragraph
    breaks in streamed text survive.
  */
  .message-stream__text {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.9375rem;
    line-height: 1.55;
    color: var(--bone);
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  /*
    "Thinking…" placeholder — sys-voice register so it reads as an
    instrument-level status, not part of the assistant's content.
  */
  .message-stream__thinking {
    margin: 0;
  }
</style>
