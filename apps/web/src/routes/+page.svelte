<script module lang="ts">
  import type { Document, ExtractResponse } from '@url-cheat-sheet/schemas';

  /**
   * The state-machine union for the page. `errorCode` was added to the
   * extract-error branch in ucs-9g9 so the ExtractErrorState component
   * can render the raw `ExtractError['kind']` (e.g. FETCH_TIMEOUT) in
   * sys-voice micro-caps next to the humanized message — required by
   * §4.3 of the spec. The network-failure fallback path (catch block,
   * no ExtractError body) uses the synthetic 'NETWORK_FAILURE' code
   * since no schema kind covers a transport error.
   */
  type State =
    | { kind: 'idle' }
    | { kind: 'extracting'; url: string }
    | { kind: 'extract-error'; message: string; errorCode: string }
    | { kind: 'flagged'; preview: ExtractResponse }
    | { kind: 'ready'; document: Document };

  /**
   * Resolve a dev-mode `?state=<kind>` query-param override to a synthetic
   * `State` with seed data, bypassing the real state machine. Returns
   * `null` when not in dev mode, when the param is absent, or when the
   * param value is not one of the known kinds.
   *
   * This helper is invoked from the page component inside a guard that
   * checks `import.meta.env.DEV`, so Vite's tree-shaker drops the entire
   * override branch from production bundles (spec §6.5).
   *
   * @param searchParams - The current URL's search params.
   * @returns A synthetic `State` for visual review, or `null`.
   */
  function resolveDevStateOverride(searchParams: URLSearchParams): State | null {
    const kind = searchParams.get('state');
    if (!kind) return null;
    switch (kind) {
      case 'idle':
        return { kind: 'idle' };
      case 'extracting':
        return { kind: 'extracting', url: 'https://example.com/dev-fixture' };
      case 'error':
        return {
          kind: 'extract-error',
          message: 'Dev override error.',
          errorCode: 'FETCH_TIMEOUT'
        };
      case 'flagged':
        return {
          kind: 'flagged',
          preview: {
            text: 'Dev override extracted text.',
            title: 'Dev Override Flagged Page',
            sourceUrl: 'https://example.com/flagged-dev',
            headings: [],
            byteSize: 100,
            scan: {
              safe: false,
              threats: [
                { type: 'instruction-override', severity: 0.7 },
                { type: 'delimiter', severity: 0.3 }
              ]
            }
          }
        };
      case 'ready':
        return {
          kind: 'ready',
          document: {
            text: 'Dev override document body.',
            title: 'Dev Override Ready Doc',
            sourceUrl: 'https://example.com/ready-dev',
            headings: []
          }
        };
      default:
        return null;
    }
  }
</script>

<script lang="ts">
  import { Chat } from '@ai-sdk/svelte';
  import { DefaultChatTransport } from 'ai';
  import { page } from '$app/state';
  import type { ExtractError } from '@url-cheat-sheet/schemas';
  import IdleState from '../lib/components/states/IdleState.svelte';
  import ExtractingState from '../lib/components/states/ExtractingState.svelte';
  import ExtractErrorState from '../lib/components/states/ExtractErrorState.svelte';
  import FlaggedState from '../lib/components/states/FlaggedState.svelte';
  import ReadyState from '../lib/components/states/ReadyState.svelte';

  let state = $state<State>({ kind: 'idle' });
  let urlInput = $state('');
  let chatInput = $state('');

  /**
   * Dev-mode-only synthetic state derived from the URL's `?state=<kind>`
   * search param. In production builds the entire branch is removed by
   * Vite's tree-shaker (the `if (!import.meta.env.DEV)` early-return
   * leaves the constant `null` in its place, and the `?? state` fallback
   * collapses to the real state machine). Spec §6.5.
   */
  const overrideState = $derived.by<State | null>(() => {
    if (!import.meta.env.DEV) return null;
    return resolveDevStateOverride(page.url.searchParams);
  });

  /**
   * The state the template actually renders. Equals `overrideState` when
   * a dev override is active, otherwise the real state-machine value.
   */
  const renderState = $derived<State>(overrideState ?? state);

  let document = $derived(renderState.kind === 'ready' ? renderState.document : null);

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

{#if renderState.kind === 'idle'}
  <IdleState bind:urlInput onSubmit={loadUrl} />
{:else if renderState.kind === 'extracting'}
  <ExtractingState url={renderState.url} />
{:else if renderState.kind === 'extract-error'}
  <ExtractErrorState
    message={renderState.message}
    errorCode={renderState.errorCode}
    onReset={reset}
  />
{:else if renderState.kind === 'flagged'}
  <FlaggedState preview={renderState.preview} onContinue={confirmFlagged} onReset={reset} />
{:else if renderState.kind === 'ready'}
  <ReadyState
    document={renderState.document}
    {chat}
    bind:chatInput
    onSendChat={sendChat}
    onReset={reset}
  />
{/if}
