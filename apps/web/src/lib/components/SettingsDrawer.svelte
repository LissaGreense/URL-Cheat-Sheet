<!--
  SettingsDrawer — BYO Anthropic key entry component
  (spec `docs/specs/2026-05-20-byo-anthropic-key.md` § UX surface, plan
  `docs/plans/2026-05-20-byo-anthropic-key.md` Task 4).

  The drawer owns two views, switched on the bound `apiKey` prop:

    1. Entry view (apiKey === null) — `<form>` with a password input,
       an eye-toggle reveal, a Save button, and the threat-model
       paragraph rendered verbatim from the spec. Inline error text
       appears below the input for empty / wrong-prefix submissions.
    2. Saved view (apiKey !== null) — confirmation chip masking the
       middle of the key and surfacing only the last 4 characters
       (`sk-ant-•••••••••••<last4>`), plus Replace and Forget key
       buttons. Forget uses a one-step inline confirmation (no native
       `confirm()` dialog).

  Storage discipline (spec § Browser-side storage):
    - This component never touches `localStorage` / `sessionStorage`.
    - After a successful Save, the underlying `<input>` element's
      `.value` is cleared via direct DOM mutation so the trimmed key
      does not linger in the DOM even though the form will unmount.
    - The cleared form-input write happens *after* the bound state
      mutation so the parent's reactive consumers see the new value
      first. The clearing is then a defensive belt-and-braces — the
      input is about to unmount anyway because the Entry view is gone.

  The parent owns the drawer chrome (gear icon, open/close, focus
  trap). This component is the entry/saved switchboard only — Task 5
  (ucs-88j) wires it into `+page.svelte`.
-->
<script lang="ts">
  /**
   * Props for SettingsDrawer.
   * @property {string | null} apiKey - Bindable. `null` when no key is
   *   set (renders Entry view); the key string when set (renders
   *   Saved view). The parent uses `bind:apiKey={apiKey}` and is the
   *   ultimate owner of the runtime value (spec § Architecture).
   */
  type Props = {
    apiKey: string | null;
  };

  let { apiKey = $bindable(null) }: Props = $props();

  // Entry-view local state — none of this leaks into the parent.
  let inputValue = $state('');
  let revealed = $state(false);
  let errorMsg = $state<string | null>(null);
  let inputEl: HTMLInputElement | null = $state(null);

  // Saved-view local state — one-step inline confirmation for Forget.
  let confirmingForget = $state(false);

  /**
   * Save handler — trims, validates the `sk-ant-` prefix, writes the
   * trimmed value to the bound `apiKey`, then clears the input
   * element's value. The clear is defensive: the form unmounts when
   * the view flips, but we don't want a stale trimmed string to live
   * even one render cycle longer than the bound state mutation.
   */
  function handleSave(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed === '') {
      errorMsg = 'Enter a key';
      return;
    }
    if (!trimmed.startsWith('sk-ant-')) {
      errorMsg = "This doesn't look like an Anthropic key (expected `sk-ant-…`)";
      return;
    }
    errorMsg = null;
    // Mutate bound state first so the parent's reactive graph picks
    // it up before we touch the DOM.
    apiKey = trimmed;
    // Spec § Browser-side storage: explicit DOM clear in addition to
    // the local `$state` reset. Both `inputValue` and `inputEl.value`
    // get nulled out so the next Entry view (after Replace) starts
    // empty.
    inputValue = '';
    if (inputEl) {
      inputEl.value = '';
    }
  }

  /**
   * Replace handler — flip back to Entry view by nulling the bound
   * key. The parent's composer-gating logic will redisable until a
   * new key is saved.
   */
  function handleReplace() {
    apiKey = null;
    confirmingForget = false;
    errorMsg = null;
  }

  /**
   * Forget click — first click switches the button into a confirm
   * prompt; second click (on the confirm button) actually nulls the
   * key. No native `confirm()` dialog per plan.
   */
  function handleForget() {
    confirmingForget = true;
  }

  function handleForgetConfirm() {
    apiKey = null;
    confirmingForget = false;
    errorMsg = null;
  }

  function handleForgetCancel() {
    confirmingForget = false;
  }

  /**
   * Last-4 masking — show `sk-ant-•••••••••••<last4>` regardless of
   * the actual key length. Spec § UX surface chip shape is the
   * normative format.
   */
  const lastFour = $derived(apiKey ? apiKey.slice(-4) : '');
</script>

{#if apiKey === null}
  <form class="drawer drawer--entry" onsubmit={handleSave} novalidate>
    <label class="drawer__label" for="byo-key-input">Anthropic API key</label>
    <div class="drawer__input-row">
      <input
        id="byo-key-input"
        bind:this={inputEl}
        bind:value={inputValue}
        type={revealed ? 'text' : 'password'}
        autocomplete="off"
        spellcheck="false"
        class="drawer__input"
        placeholder="sk-ant-..."
        aria-invalid={errorMsg !== null}
        aria-describedby={errorMsg !== null ? 'byo-key-error' : undefined}
      />
      <button
        type="button"
        class="drawer__reveal"
        data-testid="reveal-toggle"
        aria-label={revealed ? 'Hide key' : 'Show key'}
        aria-pressed={revealed}
        onclick={() => (revealed = !revealed)}
      >
        {revealed ? 'Hide' : 'Show'}
      </button>
    </div>

    {#if errorMsg !== null}
      <p id="byo-key-error" class="drawer__error" data-testid="error" role="alert">
        {errorMsg}
      </p>
    {/if}

    <button type="submit" class="drawer__save">Save</button>

    <!--
      Threat-model paragraph — verbatim from spec § Threat model —
      honest disclosure. Acceptance criterion is byte-for-byte match
      against the spec text. Do not paraphrase or reformat.
    -->
    <p class="drawer__threat-model">
      Your key is stored in this browser tab only — not on disk, not on our servers. Each chat turn
      sends your key over HTTPS to our server, which uses it once to call Anthropic and then
      discards it. Anything that runs in this tab (browser extensions, scripts) can read your key
      while the tab is open. We recommend setting a per-key spend cap in your Anthropic Console
      before pasting it here.
    </p>
  </form>
{:else}
  <div class="drawer drawer--saved">
    <div
      class="drawer__chip"
      data-testid="key-chip"
      aria-label="Saved Anthropic key, last 4 characters"
    >
      sk-ant-•••••••••••{lastFour}
    </div>

    <div class="drawer__actions">
      <button type="button" class="drawer__action" data-testid="replace" onclick={handleReplace}>
        Replace
      </button>

      {#if !confirmingForget}
        <button
          type="button"
          class="drawer__action drawer__action--danger"
          data-testid="forget"
          onclick={handleForget}
        >
          Forget key
        </button>
      {:else}
        <span class="drawer__confirm-copy"> You'll need to paste the key again to chat. </span>
        <button
          type="button"
          class="drawer__action drawer__action--danger"
          data-testid="forget-confirm"
          onclick={handleForgetConfirm}
        >
          Confirm forget
        </button>
        <button
          type="button"
          class="drawer__action"
          data-testid="forget-cancel"
          onclick={handleForgetCancel}
        >
          Cancel
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  /*
    Drawer chrome is provided by the parent — this component renders
    the inner content only. Spacing here lives on the form/saved root
    so callers can rely on a single outer surface for layout.
  */
  .drawer {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    color: var(--bone);
    font-family: var(--font-body);
  }

  .drawer__label {
    font-family: var(--font-body);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--bone-dim);
  }

  .drawer__input-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .drawer__input {
    flex: 1;
    background: transparent;
    border: 0.5px solid var(--hair);
    outline: none;
    color: var(--bone);
    caret-color: var(--green-acid);
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.5;
    padding: 0.5rem 0.75rem;
    min-width: 0;
  }
  .drawer__input::placeholder {
    color: var(--bone-dim);
  }

  /*
    Reveal toggle — text-only "Show / Hide" affordance. A pictographic
    eye glyph is reserved for Phase 2 (would need either an icon font
    or inline SVG; both pull in dependencies outside the Phase 1
    contract). The text affordance is accessible by default.
  */
  .drawer__reveal {
    background: transparent;
    border: 0.5px solid var(--hair);
    color: var(--bone-dim);
    font-family: var(--font-body);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
  }
  .drawer__reveal:hover {
    color: var(--bone);
  }

  .drawer__error {
    color: var(--amber-alarm);
    font-family: var(--font-body);
    font-size: 0.875rem;
    margin: 0;
  }

  .drawer__save {
    background: transparent;
    border: 0.5px solid var(--hair);
    color: var(--bone);
    font-family: var(--font-body);
    font-size: 0.875rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.5rem 1rem;
    cursor: pointer;
    align-self: flex-start;
  }
  .drawer__save:hover {
    border-color: var(--bone);
  }

  .drawer__threat-model {
    color: var(--bone-dim);
    font-family: var(--font-body);
    font-size: 0.8125rem;
    line-height: 1.5;
    margin: 0.5rem 0 0;
  }

  /*
    Chip — masked key surface. Monospaced glyphs would communicate the
    bullets better; deferring the font choice to Phase 2 keeps the
    Phase 1 contract typography-token-only.
  */
  .drawer__chip {
    font-family: var(--font-body);
    font-size: 0.9375rem;
    letter-spacing: 0.04em;
    color: var(--bone);
    padding: 0.5rem 0.75rem;
    border: 0.5px solid var(--hair);
    display: inline-block;
    align-self: flex-start;
  }

  .drawer__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .drawer__action {
    background: transparent;
    border: 0.5px solid var(--hair);
    color: var(--bone);
    font-family: var(--font-body);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
  }
  .drawer__action:hover {
    border-color: var(--bone);
  }
  .drawer__action--danger {
    color: var(--amber-alarm);
  }
  .drawer__action--danger:hover {
    border-color: var(--amber-alarm);
  }

  .drawer__confirm-copy {
    color: var(--bone-dim);
    font-family: var(--font-body);
    font-size: 0.8125rem;
  }
</style>
