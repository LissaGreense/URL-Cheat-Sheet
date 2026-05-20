<script lang="ts">
  import { Chat } from '@ai-sdk/svelte';
  import { DefaultChatTransport } from 'ai';
  import type { Document, ExtractResponse, ExtractError } from '@url-cheat-sheet/schemas';
  import IdleState from '../lib/components/states/IdleState.svelte';
  import ExtractingState from '../lib/components/states/ExtractingState.svelte';
  import ExtractErrorState from '../lib/components/states/ExtractErrorState.svelte';
  import FlaggedState from '../lib/components/states/FlaggedState.svelte';
  import ReadyState from '../lib/components/states/ReadyState.svelte';

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
    <ReadyState
      document={state.document}
      {chat}
      bind:chatInput
      onSendChat={sendChat}
      onReset={reset}
    />
  {/if}
</main>
