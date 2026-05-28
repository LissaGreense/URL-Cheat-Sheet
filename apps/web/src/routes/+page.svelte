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
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import type { ExtractError } from '@url-cheat-sheet/schemas';
  import IdleState from '../lib/components/states/IdleState.svelte';
  import ExtractingState from '../lib/components/states/ExtractingState.svelte';
  import ExtractErrorState from '../lib/components/states/ExtractErrorState.svelte';
  import FlaggedState from '../lib/components/states/FlaggedState.svelte';
  import ReadyState from '../lib/components/states/ReadyState.svelte';
  import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';
  import { classifyChatError, INLINE_ERROR_COPY } from '$lib/chat-error';
  import { prefersReducedMotion } from '$lib/motion/_reducedMotion';

  // Renamed from `state` to `pageState` to dodge a svelte-check
  // resolution quirk: when the reactive variable is literally named
  // `state` and `<State>` is passed as a type argument to the `$state`
  // rune, svelte2tsx/svelte-check sometimes loses the rune binding and
  // falls back to treating `$state` as a Svelte-4 store auto-subscribe
  // of a local variable named `state`, which then cascades into a
  // "Block-scoped variable '$state' used before its declaration"
  // diagnostic. Renaming is the minimal, runtime-equivalent fix.
  let pageState = $state<State>({ kind: 'idle' });
  let urlInput = $state('');
  let chatInput = $state('');

  /**
   * The user's BYO Anthropic API key. Lives in memory only — never
   * persisted to `localStorage`, `sessionStorage`, IndexedDB, or any
   * other store (spec § Browser-side storage). The `pageshow` listener
   * below also nulls this on bfcache restoration.
   */
  let apiKey = $state<string | null>(null);

  /**
   * Whether the settings drawer is currently open. A `$effect` below
   * pops this to `true` when the chat returns a key-rejected /
   * key-malformed error so the user is forced back into the entry
   * flow without an explicit click.
   */
  let drawerOpen = $state(false);

  /**
   * Inline error string surfaced above the composer in ReadyState
   * for the 429 (rate-limit) and 502/generic buckets. The 401/400
   * buckets do NOT use this surface — they reopen the drawer
   * instead.
   *
   * Tracked separately from `chat.error` because we want to keep the
   * banner visible after `chat.error` clears (e.g., a subsequent
   * successful turn would otherwise vanish the user's only signal
   * that the previous turn failed). Cleared on the next successful
   * send via the existing `sendChat` handler.
   */
  let composerInlineError = $state<string | null>(null);

  /**
   * Tracks which `chat.error` reference we've already routed. The
   * `Chat` client mutates `error` in place — the message string
   * itself is the cheapest stable identity to compare across renders.
   * Without this guard the routing `$effect` would fire on every
   * unrelated re-render while `chat.error` is still set.
   */
  let lastRoutedErrorMessage: string | undefined = undefined;

  /**
   * Dev-mode-only synthetic state derived from the URL's `?state=<kind>`
   * search param. In production builds the entire branch is removed by
   * Vite's tree-shaker (the `if (!import.meta.env.DEV)` early-return
   * leaves the constant `null` in its place, and the `?? pageState`
   * fallback collapses to the real state machine). Spec §6.5.
   */
  const overrideState = $derived.by<State | null>(() => {
    if (!import.meta.env.DEV) return null;
    return resolveDevStateOverride(page.url.searchParams);
  });

  /**
   * The state the template actually renders. Equals `overrideState` when
   * a dev override is active, otherwise the real state-machine value.
   */
  const renderState = $derived<State>(overrideState ?? pageState);

  let document = $derived(renderState.kind === 'ready' ? renderState.document : null);

  /**
   * The `prepareSendMessagesRequest` closure runs at send-time, not at
   * Chat construction time, so reading `apiKey` / `document` here
   * captures their current rune values lazily. This is what the spec
   * means by "the key exists in two memory locations during one chat
   * turn: a Svelte `$state` rune in the browser tab, and a local
   * `const` in one Vercel function invocation" (spec § Architecture)
   * — the rune is read once per send, passed to fetch, then released.
   */
  const chat = new Chat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages, document, apiKey }
      })
    })
  });

  async function loadUrl(e: SubmitEvent) {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;
    pageState = { kind: 'extracting', url };
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const body = await res.json();
      if (!res.ok) {
        const err = body as ExtractError;
        pageState = { kind: 'extract-error', message: humanizeError(err), errorCode: err.kind };
        return;
      }
      const preview = body as ExtractResponse;
      if (!preview.scan.safe) {
        pageState = { kind: 'flagged', preview };
        return;
      }
      // Safe extraction → advance straight to `ready`. The
      // extracting → ready handoff is now a cosmetic opacity cross-fade
      // (Svelte's built-in `fade` on the conditional branches below),
      // so the state flips synchronously here with no overlay, no
      // pending stash, and no completion callback (ucs-52o, superseding
      // the cinematic overlay from ucs-apq).
      pageState = {
        kind: 'ready',
        document: {
          text: preview.text,
          title: preview.title,
          sourceUrl: preview.sourceUrl,
          headings: preview.headings
        }
      };
    } catch (err) {
      pageState = {
        kind: 'extract-error',
        message: 'Network error: ' + String(err),
        errorCode: 'NETWORK_FAILURE'
      };
    }
  }

  function confirmFlagged() {
    if (pageState.kind !== 'flagged') return;
    const { preview } = pageState;
    // `headings` is required by the `Document` shape (ucs-2qf added it).
    // The loadUrl path already forwards `preview.headings`; this branch
    // had been omitting it — a latent bug surfaced once svelte-check's
    // `exactOptionalPropertyTypes`+`Pick` narrowing reached this file
    // via the corrected tsconfig.
    pageState = {
      kind: 'ready',
      document: {
        text: preview.text,
        title: preview.title,
        sourceUrl: preview.sourceUrl,
        headings: preview.headings
      }
    };
  }

  function reset() {
    pageState = { kind: 'idle' };
    urlInput = '';
    chat.messages = [];
  }

  /**
   * Cross-fade duration (ms) for the extracting → ready (and other
   * state) swaps. ADR 0009: reduced-motion collapses this to `0` for an
   * instant, animation-free swap. `prefersReducedMotion()` is SSR-safe
   * (returns `false` when `window` is undefined) and reads `matchMedia`
   * lazily, so this is a `$derived` rather than a module constant —
   * Svelte re-evaluates it client-side once the preference is readable.
   */
  const fadeDuration = $derived(prefersReducedMotion() ? 0 : 250);

  function sendChat(e: SubmitEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || pageState.kind !== 'ready' || apiKey === null) return;
    // Optimistically clear the inline error — the next chat.error
    // mutation (if any) will rehydrate it via the routing effect.
    composerInlineError = null;
    chat.sendMessage({ text });
    chatInput = '';
  }

  /**
   * bfcache guard (spec § Browser-side storage). When the browser
   * restores this page from its back/forward cache, `event.persisted`
   * is `true` — and the in-memory `apiKey` rune would still hold the
   * pre-navigation value. Nulling it forces the user to re-enter the
   * key, matching the "in-memory only, does not survive tab close
   * /restore" invariant.
   *
   * Lives inside `$effect`, which only runs on the client — `window`
   * is never accessed during SSR.
   */
  $effect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted === true) {
        apiKey = null;
      }
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  });

  /**
   * Client-side error routing (spec § Error taxonomy, plan Task 5).
   * The `@ai-sdk/svelte` `Chat` client exposes `error: Error | undefined`
   * but not the HTTP status code — we substring-match the message
   * against the four Task 3 (ucs-qdp) contract strings to decide
   * which branch the page should follow.
   *
   * Branches:
   *   - 'key-rejected' / 'key-malformed' → reopen the drawer, null
   *     the apiKey rune, focus the key input on the next tick.
   *   - 'rate-limit' → inline message above composer; keep the key.
   *   - 'generic'    → inline message above composer; keep the key.
   *
   * The `lastRoutedErrorMessage` cursor prevents re-routing the same
   * error on every re-render — we only act when the message changes.
   */
  $effect(() => {
    const message = chat.error?.message;
    if (message === undefined) {
      // Error cleared (e.g., new turn started); reset the cursor so a
      // subsequent identical-string error can route again.
      lastRoutedErrorMessage = undefined;
      return;
    }
    if (message === lastRoutedErrorMessage) return;
    lastRoutedErrorMessage = message;

    const kind = classifyChatError(message);
    if (kind === 'key-rejected' || kind === 'key-malformed') {
      // Force re-entry: clear the inline surface (the drawer carries
      // the rejection copy itself), null the key, pop the drawer.
      composerInlineError = null;
      apiKey = null;
      drawerOpen = true;
      // Focus the key input once the drawer's entry view paints. The
      // drawer always renders its input with `id="byo-key-input"`
      // (see SettingsDrawer.svelte), so a direct getElementById is
      // the minimal coupling needed without modifying the drawer.
      // Use `window.document` because the local `document` rune above
      // shadows the global identifier inside this script.
      void tick().then(() => {
        const input = window.document.getElementById('byo-key-input') as HTMLInputElement | null;
        input?.focus();
      });
    } else {
      composerInlineError = INLINE_ERROR_COPY[kind];
    }
  });

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
      case 'INTERNAL_ERROR':
        return 'Something went wrong on our end. Please try again.';
    }
  }
</script>

<!--
  Page-level settings gear. Lives on every state (idle, extracting,
  ready, etc.) so the user can paste their key before they ingest a
  URL, or revisit settings mid-session. Fixed top-right so it does not
  fight with the cinematic state-component layouts. The settings drawer
  itself hangs off the same surface — collapsed by default; the gear
  toggles it open.
-->
<button
  type="button"
  class="settings-gear"
  data-testid="settings-gear"
  aria-label="Settings"
  aria-expanded={drawerOpen}
  aria-controls="settings-drawer-panel"
  onclick={() => (drawerOpen = !drawerOpen)}
>
  <span aria-hidden="true">⚙</span>
</button>

{#if drawerOpen}
  <aside
    id="settings-drawer-panel"
    class="settings-drawer-panel"
    data-testid="settings-drawer-panel"
    aria-label="Settings"
  >
    <div class="settings-drawer-panel__header">
      <h2 class="settings-drawer-panel__title">SETTINGS</h2>
      <button
        type="button"
        class="settings-drawer-panel__close"
        data-testid="settings-drawer-close"
        aria-label="Close settings"
        onclick={() => (drawerOpen = false)}
      >
        ×
      </button>
    </div>
    <SettingsDrawer bind:apiKey />
  </aside>
{/if}

{#if renderState.kind === 'idle'}
  <IdleState bind:urlInput onSubmit={loadUrl} />
{:else if renderState.kind === 'extracting'}
  <!--
    The extracting and ready branches each carry `transition:fade`, so
    Svelte runs an opacity out/in when the conditional swaps from
    extracting → ready — a cosmetic cross-fade (ucs-52o, superseding the
    GSAP overlay from ucs-apq). `fadeDuration` collapses to 0 under
    prefers-reduced-motion for an instant swap (ADR 0009).
  -->
  <div transition:fade={{ duration: fadeDuration }}>
    <ExtractingState url={renderState.url} />
  </div>
{:else if renderState.kind === 'extract-error'}
  <ExtractErrorState
    message={renderState.message}
    errorCode={renderState.errorCode}
    onReset={reset}
  />
{:else if renderState.kind === 'flagged'}
  <FlaggedState preview={renderState.preview} onContinue={confirmFlagged} onReset={reset} />
{:else if renderState.kind === 'ready'}
  <div transition:fade={{ duration: fadeDuration }}>
    <ReadyState
      document={renderState.document}
      {chat}
      bind:chatInput
      keySet={apiKey !== null}
      inlineError={composerInlineError}
      onSendChat={sendChat}
      onReset={reset}
    />
  </div>
{/if}

<style>
  /*
    Settings gear — fixed top-right surface, mirrors the top-left
    sys-voice header anchors in the state components. Keeps the gear
    above all state-component chrome via z-index.
  */
  .settings-gear {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 2;
    background: transparent;
    border: 0.5px solid var(--hair);
    color: var(--bone-dim);
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1;
    padding: 0.5rem 0.625rem;
    cursor: pointer;
  }
  .settings-gear:hover {
    color: var(--bone);
    border-color: var(--bone-dim);
  }

  /*
    Settings drawer panel — slides over from the right. Phase 1 ships
    static; motion is Phase 2. Sized to comfortably accommodate the
    SettingsDrawer's input row + threat-model paragraph.
  */
  .settings-drawer-panel {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 3;
    width: min(22rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    padding: 1rem;
    background: var(--ink);
    border: 0.5px solid var(--hair);
    color: var(--bone);
  }

  .settings-drawer-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .settings-drawer-panel__title {
    font-family: var(--font-display);
    font-size: 0.75rem;
    letter-spacing: 0.16em;
    color: var(--bone-dim);
    margin: 0;
  }

  .settings-drawer-panel__close {
    background: transparent;
    border: none;
    color: var(--bone-dim);
    font-size: 1.25rem;
    line-height: 1;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
  }
  .settings-drawer-panel__close:hover {
    color: var(--bone);
  }
</style>
