<script lang="ts">
  import { Chat } from '@ai-sdk/svelte';
  import { DefaultChatTransport } from 'ai';
  import type { Document, ExtractResponse, ExtractError } from '@url-cheat-sheet/schemas';
  import IdleState from '../lib/components/states/IdleState.svelte';
  import ExtractingState from '../lib/components/states/ExtractingState.svelte';
  import ExtractErrorState from '../lib/components/states/ExtractErrorState.svelte';
  import FlaggedState from '../lib/components/states/FlaggedState.svelte';

  // `errorCode` was added to the extract-error branch in ucs-9g9 so the
  // ExtractErrorState component can render the raw `ExtractError['kind']`
  // (e.g. FETCH_TIMEOUT) in sys-voice micro-caps next to the humanized
  // message — required by §4.3 of the spec. The network-failure fallback
  // path (catch block, no ExtractError body) uses the synthetic
  // 'NETWORK_FAILURE' code since no schema kind covers a transport error.
  type State =
    | { kind: 'idle' }
    | { kind: 'extracting'; url: string }
    | { kind: 'extract-error'; message: string; errorCode: string }
    | { kind: 'flagged'; preview: ExtractResponse }
    | { kind: 'ready'; document: Document };

  let state = $state<State>({ kind: 'idle' });
  let urlInput = $state('');
  let chatInput = $state('');

  let document = $derived(state.kind === 'ready' ? state.document : null);

  const chat = new Chat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages, document }
      })
    })
  });

  async function loadUrl(e: SubmitEvent) {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;
    state = { kind: 'extracting', url };
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const body = await res.json();
      if (!res.ok) {
        const err = body as ExtractError;
        state = { kind: 'extract-error', message: humanizeError(err), errorCode: err.kind };
        return;
      }
      const preview = body as ExtractResponse;
      if (!preview.scan.safe) {
        state = { kind: 'flagged', preview };
        return;
      }
      state = {
        kind: 'ready',
        document: {
          text: preview.text,
          title: preview.title,
          sourceUrl: preview.sourceUrl,
          headings: preview.headings
        }
      };
    } catch (err) {
      state = {
        kind: 'extract-error',
        message: 'Network error: ' + String(err),
        errorCode: 'NETWORK_FAILURE'
      };
    }
  }

  function confirmFlagged() {
    if (state.kind !== 'flagged') return;
    const { preview } = state;
    state = {
      kind: 'ready',
      document: { text: preview.text, title: preview.title, sourceUrl: preview.sourceUrl }
    };
  }

  function reset() {
    state = { kind: 'idle' };
    urlInput = '';
    chat.messages = [];
  }

  function sendChat(e: SubmitEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || state.kind !== 'ready') return;
    chat.sendMessage({ text });
    chatInput = '';
  }

  /**
   * Returns true when the assistant message already contains the
   * `finalize` tool call (in any state). Used to suppress the
   * "Thinking…" placeholder once the model has begun streaming its
   * final answer.
   */
  function hasFinalize(parts: ReadonlyArray<{ type: string }>): boolean {
    return parts.some((p) => p.type === 'tool-finalize');
  }

  /**
   * True when the user has submitted a question but no assistant
   * message has been appended yet. The Chat client transitions
   * `status` to `submitted` synchronously inside `sendMessage`, but
   * the assistant message only appears once the SSE stream opens.
   * Without this guard, the UI sits silent in that gap.
   */
  let awaitingAssistant = $derived(
    chat.status === 'submitted' &&
      (chat.messages.length === 0 || chat.messages[chat.messages.length - 1]!.role === 'user')
  );

  function humanizeError(err: ExtractError): string {
    switch (err.kind) {
      case 'FETCH_TIMEOUT':
        return 'The page took too long to load.';
      case 'FETCH_TOO_LARGE':
        return 'The page is too large to load.';
      case 'FETCH_BLOCKED_URL':
        return 'That URL is not allowed.';
      case 'FETCH_UNSUPPORTED_CONTENT_TYPE':
        return 'Only HTML pages are supported.';
      case 'FETCH_HTTP_ERROR':
        return 'The page server returned an error.';
      case 'FETCH_NETWORK':
        return 'Could not reach the page.';
      case 'EMPTY_EXTRACTION':
        return 'Could not extract readable content (the page may be JavaScript-rendered).';
      case 'PARSE_FAILED':
        return 'Could not parse the page.';
    }
  }
</script>

<main class="container">
  <h1>URL Cheat Sheet</h1>

  {#if state.kind === 'idle'}
    <IdleState bind:urlInput onSubmit={loadUrl} />
  {:else if state.kind === 'extracting'}
    <ExtractingState url={state.url} />
  {:else if state.kind === 'extract-error'}
    <ExtractErrorState message={state.message} errorCode={state.errorCode} onReset={reset} />
  {:else if state.kind === 'flagged'}
    <FlaggedState preview={state.preview} onContinue={confirmFlagged} onReset={reset} />
  {:else if state.kind === 'ready'}
    <p class="chip">
      Grounded in: <strong>{state.document.title}</strong> ·
      <button type="button" class="link" onclick={reset}>change</button>
    </p>

    <ol class="messages">
      {#each chat.messages as message (message.id)}
        <li class="message message--{message.role}">
          <span class="role">{message.role}</span>
          {#each message.parts as part, i (i)}
            {#if part.type === 'text'}
              <p class="text">{part.text}</p>
            {:else if part.type === 'tool-finalize'}
              {@const input = part.input as { answer?: string; citations?: string[] } | undefined}
              {#if part.state === 'input-available' || part.state === 'output-available'}
                <p class="text">{input?.answer ?? ''}</p>
                {#if input?.citations && input.citations.length > 0}
                  <p class="citations">
                    Citations: {input.citations.join(', ')}
                  </p>
                {/if}
              {:else if part.state === 'input-streaming'}
                {#if input?.answer}
                  <p class="text streaming">{input.answer}</p>
                {:else}
                  <p class="text streaming muted">Thinking…</p>
                {/if}
              {/if}
            {:else if part.type === 'tool-grep_doc'}
              <details class="tool">
                <summary>searched the document ({part.state})</summary>
                <pre>{JSON.stringify(part, null, 2)}</pre>
              </details>
            {:else if part.type?.startsWith('tool-') || part.type === 'dynamic-tool'}
              <details class="tool">
                <summary>tool call: {part.type}</summary>
                <pre>{JSON.stringify(part, null, 2)}</pre>
              </details>
            {/if}
          {/each}
          {#if message.role === 'assistant' && !hasFinalize(message.parts) && (chat.status === 'submitted' || chat.status === 'streaming')}
            <p class="text muted">Thinking…</p>
          {/if}
        </li>
      {/each}
      {#if awaitingAssistant}
        <li class="message message--assistant">
          <span class="role">assistant</span>
          <p class="text muted">Thinking…</p>
        </li>
      {/if}
    </ol>

    <form onsubmit={sendChat} class="composer">
      <input
        type="text"
        bind:value={chatInput}
        placeholder="Ask about this page..."
        aria-label="Message"
        disabled={chat.status === 'streaming' || chat.status === 'submitted'}
      />
      <button type="submit" disabled={!chatInput.trim() || chat.status === 'streaming'}>Send</button
      >
    </form>
  {/if}
</main>

<style>
  .container {
    max-width: 48rem;
    margin: 2rem auto;
    padding: 0 1rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .hint {
    color: #666;
    font-size: 0.9rem;
  }
  .error {
    color: #b00;
  }
  .chip {
    background: #f0f0f0;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  .flagged {
    border: 1px solid #e0a;
    padding: 1rem;
    border-radius: 6px;
  }
  .flagged h2 {
    margin-top: 0;
  }
  .messages {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .message {
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    padding: 0.75rem 1rem;
  }
  .message--user {
    background: #f7f7f7;
  }
  .role {
    display: block;
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    margin-bottom: 0.25rem;
  }
  .text {
    margin: 0;
    white-space: pre-wrap;
  }
  .text.streaming {
    opacity: 0.85;
  }
  .text.muted,
  .muted {
    color: #888;
    font-style: italic;
  }
  .citations {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: #555;
  }
  .tool {
    margin-top: 0.5rem;
    font-size: 0.8rem;
  }
  .tool pre {
    background: #f0f0f0;
    padding: 0.5rem;
    overflow-x: auto;
  }
  .composer {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .composer input {
    flex: 1;
    padding: 0.5rem;
    font-size: 1rem;
  }
  .link {
    background: none;
    border: none;
    color: #06c;
    cursor: pointer;
    padding: 0;
    font-size: inherit;
  }
</style>
