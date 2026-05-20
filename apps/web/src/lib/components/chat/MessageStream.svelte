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
    - `type === 'text'`         → body sans paragraph
    - `type === 'tool-grep_doc'` → `<GrepDocScan>`
    - `type === 'tool-finalize'` → `<FinalizeScan>`
    - Any other tool-* type     → log to console + render nothing
      (spec §5.5: no debug fallback in production)
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
   * returns an array of matches under `hits`, but we accept either
   * `output.hits.length` or a numeric `output.count` to keep this
   * resilient to tool shape changes.
   */
  function hitsFor(output: unknown): number | null {
    if (!output || typeof output !== 'object') return null;
    const o = output as Record<string, unknown>;
    const hits = o['hits'];
    if (Array.isArray(hits)) return hits.length;
    if (typeof hits === 'number') return hits;
    const count = o['count'];
    if (typeof count === 'number') return count;
    return null;
  }

  /**
   * Extract the pattern string from a grep_doc `input` payload. The
   * input shape is `{ pattern: string }` (renamed from `query` in
   * ucs-8nl / PR #120 to advertise pipe-separated OR-union support);
   * fall back to empty string if the model hasn't streamed the pattern
   * yet. The prop on `GrepDocScan` is still named `query` because that
   * matches the sys-voice label (`q: "..."`) in the scan card.
   */
  function queryFor(input: unknown): string {
    if (!input || typeof input !== 'object') return '';
    const i = input as Record<string, unknown>;
    const p = i['pattern'];
    return typeof p === 'string' ? p : '';
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
   * Log + ignore unknown tool types. Spec §5.5 requires every shipped
   * tool to have a deliberate scan vocabulary — falling back to a
   * default <pre>JSON</pre> in production is explicitly prohibited.
   */
  function warnUnknownTool(type: string): void {
    if (typeof console !== 'undefined') {
      console.warn(`[MessageStream] unknown tool type "${type}" — no scan registered`);
    }
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
          {#each message.parts as part, i (i)}
            {#if part.type === 'text'}
              <p class="message-stream__text">{part.text}</p>
            {/if}
          {/each}
        </div>
      {:else}
        <div class="message-stream__assistant">
          {#each message.parts as part, i (i)}
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
            {:else if part.type?.startsWith?.('tool-') || part.type === 'dynamic-tool'}
              <!--
                Unknown tool — log + render nothing. Spec §5.5: no
                debug fallback in production.
              -->
              {warnUnknownTool(part.type)}
            {/if}
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
