<!--
  ReadyState — the cinematic chat layout (spec §4.5, plan Task 5).

  ## Reactivity contract (load-bearing)

  Takes the full `Chat` instance (NOT `messages: ReadonlyArray<UIMessage>`)
  so Svelte 5 reactivity propagates as SSE tokens arrive. The `Chat`
  instance is passed straight through to `MessageStream`, which reads
  `chat.messages` directly inside its template. See
  `MessageStream.svelte` for the matching rule.

  ## Layout (spec §4.5)

  - Top:    memory chip — // MEMORY_ACTIVE + document title + > change
  - Center: scrolling thread (`<MessageStream>`)
  - Bottom: composer (`<Composer>`) — the only thing that does not dim

  Plus the persistent ambient anchors:
  - Top-left:     // MEMORY_ACTIVE sys-voice header
  - Bottom-right: 001 SESSION corner stamp

  When the thread is empty, MessageStream area also shows the greeting
  "URL has been loaded to your memory. Ask questions to get knowledge
  access." — injected once on first paint.
-->
<script lang="ts">
  import type { Chat } from '@ai-sdk/svelte';
  import type { Document } from '@url-cheat-sheet/schemas';
  import SysLabel from '../hud/SysLabel.svelte';
  import CornerStamp from '../hud/CornerStamp.svelte';
  import HudPanel from '../hud/HudPanel.svelte';
  import MessageStream from '../chat/MessageStream.svelte';
  import Composer from '../chat/Composer.svelte';

  /**
   * Props for ReadyState.
   * @property {Document} document - The ingested document; only `title`
   *   is surfaced in the memory chip.
   * @property {Pick<Chat, 'messages'> & { status?: Chat['status'] }} chat -
   *   The live Chat instance from the parent state machine (or a
   *   structural mock in tests — see ReadyState.test-host.svelte).
   *   Forwarded as-is to MessageStream so SSE reactivity propagates —
   *   do NOT destructure `chat.messages` here. We narrow to the read
   *   surface (`messages`, optional `status`) so the test-host can
   *   pass a duck-typed mock without an `as any` cast at the boundary;
   *   a real `Chat` always provides both.
   * @property {string} chatInput - Bindable composer value. Parent owns
   *   the state; this component reads + writes via the binding.
   * @property {boolean} [keySet] - Whether the BYO Anthropic key is
   *   currently set in the parent's `apiKey` rune (ucs-88j). When
   *   `false`/omitted, the composer is disabled and the placeholder
   *   directs the user to add a key in settings. Defaults to `true`
   *   to keep test-hosts that don't care about the BYO-key gating
   *   working unchanged.
   * @property {string | null} [inlineError] - Optional inline error
   *   surface above the composer for the BYO-key error taxonomy
   *   (ucs-88j, spec § Error taxonomy). The 429 and 502 buckets
   *   render here without clearing the key; the 401/400 buckets are
   *   handled at the page level by reopening the drawer.
   * @property {(e: SubmitEvent) => void} onSendChat - Composer submit
   *   handler. Parent (`sendChat`) preventDefaults + sends via the
   *   Chat transport.
   * @property {() => void} onReset - Clicked when the user hits the
   *   `> change` link in the memory chip. Parent (`reset`) clears
   *   chat.messages + returns to idle.
   */
  type Props = {
    document: Document;
    chat: Pick<Chat, 'messages'> & { status?: Chat['status'] };
    chatInput: string;
    keySet?: boolean | undefined;
    inlineError?: string | null | undefined;
    onSendChat: (e: SubmitEvent) => void;
    onReset: () => void;
  };

  let {
    document,
    chat,
    chatInput = $bindable(''),
    keySet = true,
    inlineError = null,
    onSendChat,
    onReset
  }: Props = $props();

  /**
   * Empty-thread greeting — auto-rendered as the first thing the user
   * sees inside the chat area when `chat.messages.length === 0`. Spec
   * §4.5 specifies the exact text + a `splitLineReveal` motion (Phase
   * 2). Phase 1 ships the text static.
   */
  const showGreeting = $derived(chat.messages.length === 0);

  /**
   * `awaitingAssistant` — true when the user has submitted but the
   * assistant message hasn't appeared yet. The Chat client transitions
   * `status` to `submitted` synchronously inside `sendMessage`, but
   * the assistant message only appears once the SSE stream opens.
   * Without this guard, the UI sits silent in that gap.
   */
  const awaitingAssistant = $derived(
    chat.status === 'submitted' &&
      (chat.messages.length === 0 || chat.messages[chat.messages.length - 1]!.role === 'user')
  );

  /**
   * Disable the composer while the chat is in-flight OR when the BYO
   * Anthropic key has not been set. Matches the pre-redesign
   * +page.svelte behavior: streaming OR submitted both lock the input
   * so the user can't queue a second turn mid-stream. The `!keySet`
   * arm (ucs-88j) blocks the user from sending a request that the
   * server would just 400 on.
   */
  const composerDisabled = $derived(
    chat.status === 'streaming' || chat.status === 'submitted' || !keySet
  );

  /**
   * Placeholder swaps when no key is set so the disabled state
   * communicates *why* it's disabled (spec § UX surface). The
   * Composer component owns the default "Ask about this page..."
   * copy; we only override when we need to.
   */
  const composerPlaceholder = $derived(
    keySet ? undefined : 'Add your Anthropic API key in settings to start chatting'
  );
</script>

<CornerStamp text="001 SESSION" position="bottom-right" />

<div class="ready-state__header">
  <SysLabel kind="header">MEMORY_ACTIVE</SysLabel>
</div>

<div class="ready-state">
  <!--
    Memory chip — HudPanel-wrapped, persistent. Holds the
    MEMORY_ACTIVE sys label, the document title, and the > change
    link that calls onReset.
  -->
  <div class="ready-state__memory-chip">
    <HudPanel>
      <div class="ready-state__memory-chip-body">
        <SysLabel kind="header">MEMORY_ACTIVE</SysLabel>
        <span class="ready-state__memory-title">{document.title}</span>
        <button
          type="button"
          class="ready-state__reset"
          data-testid="ready-reset"
          onclick={onReset}
        >
          <SysLabel kind="action">CHANGE</SysLabel>
        </button>
      </div>
    </HudPanel>
  </div>

  <!--
    Thread area — empty-state greeting OR the message stream. The
    greeting is rendered before any messages exist; once the user
    sends a question the stream takes over.
  -->
  <section class="ready-state__thread">
    {#if showGreeting}
      <div class="ready-state__greeting" data-testid="ready-greeting">
        <p class="ready-state__greeting-line">URL has been loaded to your memory.</p>
        <p class="ready-state__greeting-line">Ask questions to get knowledge access.</p>
      </div>
    {/if}

    <MessageStream {chat} {awaitingAssistant} />
  </section>

  <!--
    Composer pinned bottom — only un-dimmed surface per spec §4.5.
    The optional inline error sits *above* the composer (spec §
    Error taxonomy, ucs-88j) for the 429 + generic buckets that
    don't reopen the drawer.
  -->
  <div class="ready-state__composer">
    {#if inlineError}
      <p class="ready-state__inline-error" data-testid="ready-inline-error" role="alert">
        {inlineError}
      </p>
    {/if}
    <Composer
      bind:value={chatInput}
      disabled={composerDisabled}
      placeholder={composerPlaceholder}
      onSubmit={onSendChat}
    />
  </div>
</div>

<style>
  /*
    Persistent corner anchors mirror IdleState/ExtractingState — 1rem
    inset, fixed position. The corner stamp is positioned by its own
    component.
  */
  .ready-state__header {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 1;
  }

  /*
    Layout — single column, generous max-width. Stack:
      memory chip → thread → composer.
    Thread flexes so long sessions scroll inside the page, not off-
    screen.
  */
  .ready-state {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-height: 100vh;
    max-width: 56rem;
    margin: 0 auto;
    padding: 4rem 2rem 2rem;
  }

  /*
    Memory chip — narrow horizontal strip with the document title
    and the > change link. The chip is the persistent ambient
    anchor for the loaded document.
  */
  .ready-state__memory-chip {
    width: 100%;
  }

  .ready-state__memory-chip-body {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .ready-state__memory-title {
    flex: 1 1 auto;
    font-family: var(--font-body);
    font-size: 0.9375rem;
    line-height: 1.4;
    color: var(--bone);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /*
    The > change link — borderless, sys-voice CHANGE label carries
    the visible weight. Underlines on hover via the SysLabel's
    descendant body span.
  */
  .ready-state__reset {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    color: inherit;
    font: inherit;
  }
  .ready-state__reset:hover :global(.sys-label__body) {
    color: var(--green-acid);
  }

  /*
    Thread area — flexes to fill the space between memory chip and
    composer. Greeting renders above the (initially empty) stream.
  */
  .ready-state__thread {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-height: 0;
  }

  /*
    Greeting — body sans, slightly larger than message text to read
    as a screen-level statement, not a message.
  */
  .ready-state__greeting {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .ready-state__greeting-line {
    margin: 0;
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.55;
    color: var(--bone-dim);
  }

  /*
    Composer pinned bottom of the column. The Composer component
    owns its own outer margin — this wrapper just reserves the slot.
  */
  .ready-state__composer {
    width: 100%;
  }

  /*
    Inline error surface for the BYO-key 429/generic buckets (ucs-88j).
    Sits above the composer; amber-alarm tone matches the drawer's
    error styling so the visual language is consistent across the
    error taxonomy.
  */
  .ready-state__inline-error {
    margin: 0 0 0.5rem;
    color: var(--amber-alarm);
    font-family: var(--font-body);
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
