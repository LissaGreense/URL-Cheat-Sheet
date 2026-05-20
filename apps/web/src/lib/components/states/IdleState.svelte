<!--
  IdleState — the cinematic idle screen (spec §4.1, plan Task 3).

  Composition (no motion — Phase 1):
    - Display-face wordmark `URL_CHEAT_SHEET` (var(--font-display)).
    - Display-face directive `LOAD URL TO YOUR MEMORY`.
    - `<HudPanel>` wrapping a URL input and the `[ STANDBY ] / [ READY ]`
      status pill.
    - `<SysLabel kind="action">INGEST</SysLabel>` inside the form's
      submit button.
    - `<SysLabel kind="header">AWAITING_SOURCE</SysLabel>` anchored
      top-left (via CornerStamp).
    - `<CornerStamp text="001 SESSION" position="bottom-right">`
      persistent stamp.

  The state machine in `+page.svelte` owns `urlInput` (bindable here)
  and the submit handler (`onSubmit` callback) — this component is
  purely presentational.
-->
<script lang="ts">
  import HudPanel from '../hud/HudPanel.svelte';
  import StatusPill from '../hud/StatusPill.svelte';
  import SysLabel from '../hud/SysLabel.svelte';
  import CornerStamp from '../hud/CornerStamp.svelte';

  /**
   * Props for IdleState.
   * @property {string} urlInput - Bindable URL input value. Owned by the
   *   parent state machine in `+page.svelte`; this component reads it
   *   to derive the pill state and writes it back via the bound input.
   * @property {(e: SubmitEvent) => void} onSubmit - Form submit handler.
   *   The parent (`loadUrl`) preventDefaults and reads `urlInput`.
   */
  type Props = {
    urlInput: string;
    onSubmit: (e: SubmitEvent) => void;
  };

  let { urlInput = $bindable(''), onSubmit }: Props = $props();

  // `$derived` so the pill tracks the bound input — recomputes on every
  // keystroke. Non-empty trimmed → READY, else STANDBY (spec §4.1).
  const pillState = $derived(urlInput.trim() ? 'READY' : 'STANDBY');
</script>

<CornerStamp text="001 SESSION" position="bottom-right" />

<div class="idle-header">
  <SysLabel kind="header">AWAITING_SOURCE</SysLabel>
</div>

<div class="idle-state">
  <h1 class="wordmark">URL_CHEAT_SHEET</h1>

  <p class="directive">LOAD URL TO YOUR MEMORY</p>

  <form class="idle-form" onsubmit={onSubmit}>
    <HudPanel>
      <div class="idle-panel-body">
        <input
          type="url"
          class="idle-input"
          bind:value={urlInput}
          placeholder="https://..."
          aria-label="Page URL"
        />
        <StatusPill state={pillState} tone={urlInput.trim() ? 'normal' : 'dim'} />
      </div>
    </HudPanel>

    <button type="submit" class="idle-submit" disabled={!urlInput.trim()}>
      <SysLabel kind="action">INGEST</SysLabel>
    </button>
  </form>
</div>

<style>
  /*
    Idle layout — centered column with generous vertical breathing room.
    The wordmark + directive + form stack vertically; the top-left
    `// AWAITING_SOURCE` label and the bottom-right corner stamp are
    fixed-position anchors that sit outside the column.
  */
  .idle-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 4rem 2rem;
    gap: 2.5rem;
    text-align: center;
  }

  /*
    `// AWAITING_SOURCE` lives in the top-left gutter — same inset as
    CornerStamp (1rem) so all four corners line up visually.
  */
  .idle-header {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 1;
  }

  /*
    Wordmark — display-face, wide letter-spacing per spec §2.2 row 1.
    Smaller than the directive so it reads as the page label, not the
    headline.
  */
  .wordmark {
    font-family: var(--font-display);
    font-weight: 500;
    font-size: clamp(0.875rem, 1.6vw, 1.125rem);
    letter-spacing: 0.25em;
    color: var(--bone-dim);
    margin: 0;
    text-transform: uppercase;
  }

  /*
    Directive — the load-bearing display-face headline. Size scales
    with viewport so the cinematic feel holds on both desktop and
    laptop screens (spec §4.1 calls this out as "large display-face").
  */
  .directive {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: clamp(1.75rem, 4.5vw, 3rem);
    line-height: 1.1;
    letter-spacing: 0.02em;
    color: var(--bone);
    margin: 0;
    max-width: 18ch;
    text-transform: uppercase;
  }

  /*
    The composer — HudPanel + INGEST button. The button hangs below the
    panel rather than inside it so its sys-voice INGEST label keeps its
    own clickable surface (spec §4.1 says "Action `> INGEST`").
  */
  .idle-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: 100%;
    max-width: 36rem;
  }

  /*
    Panel body — input + status pill arranged inline. The pill stays on
    the right; the input flexes to fill remaining width.
  */
  .idle-panel-body {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .idle-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--bone);
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.5;
    min-width: 0; /* allows flex shrink */
  }
  .idle-input::placeholder {
    color: var(--bone-dim);
  }

  /*
    Submit button — borderless surface that lets the SysLabel `> INGEST`
    carry the visual weight. Disabled state dims via opacity (the pill
    next to it already communicates STANDBY).
  */
  .idle-submit {
    background: transparent;
    border: none;
    padding: 0.5rem 1rem;
    cursor: pointer;
    color: inherit;
  }
  .idle-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
