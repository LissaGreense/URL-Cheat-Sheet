<!--
  Composer — HUD-wrapped chat input + send button (spec §4.5, plan
  Task 5). The composer is the only thing on the ready screen that does
  not dim — it is the active locus.

  Composition:
    - `<HudPanel>` around a `<form>` with a text `<input>` and a submit
      `<button>` carrying the `> SEND` sys-voice action label.
    - Phase 1 ships static chrome only; the spec's `1 → 0.98 → 1`
      send-scale and the animated caret are Phase 2 motion.

  The parent state machine owns the value (`chatInput`) and the submit
  handler (`sendChat`) — this component is purely presentational.
-->
<script lang="ts">
  import HudPanel from '../hud/HudPanel.svelte';
  import SysLabel from '../hud/SysLabel.svelte';

  /**
   * Props for Composer.
   * @property {string} value - Bindable input value. The parent owns
   *   the state (`chatInput` in `+page.svelte`); this component reads
   *   + writes via the binding.
   * @property {boolean} disabled - When true, disables both the input
   *   and the submit button (e.g. while the chat is streaming).
   * @property {(e: SubmitEvent) => void} onSubmit - Form submit
   *   handler. The parent (`sendChat`) preventDefaults and reads the
   *   bound value.
   */
  type Props = {
    value: string;
    disabled: boolean;
    onSubmit: (e: SubmitEvent) => void;
  };

  let { value = $bindable(''), disabled, onSubmit }: Props = $props();

  // `$derived` so the button tracks both `value` (non-empty trimmed)
  // and `disabled` — keystroke updates flip it without an explicit
  // listener.
  const canSubmit = $derived(!disabled && value.trim().length > 0);
</script>

<form class="composer" onsubmit={onSubmit}>
  <HudPanel>
    <div class="composer__row">
      <input
        type="text"
        class="composer__input"
        bind:value
        placeholder="Ask about this page..."
        aria-label="Message"
        {disabled}
      />
      <button type="submit" class="composer__submit" disabled={!canSubmit}>
        <SysLabel kind="action">SEND</SysLabel>
      </button>
    </div>
  </HudPanel>
</form>

<style>
  /*
    Form is borderless — the HudPanel inside carries the visible chrome
    (border + backdrop blur). Margins land on the form so callers can
    rely on a single spacing surface.
  */
  .composer {
    margin: 1rem 0 0;
    width: 100%;
  }

  /*
    Single row: input flexes, submit button sits flush right. Baseline
    alignment keeps the sys-voice SEND label visually paired with the
    input's text baseline.
  */
  .composer__row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  /*
    Input — transparent surface; the HudPanel border + atmospheric tint
    is what makes it read as a HUD slot. No outline on focus — the
    caret + (Phase 2) caret pulse is the focus affordance per spec §4.5.
  */
  .composer__input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--bone);
    caret-color: var(--green-acid);
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.5;
    min-width: 0;
  }
  .composer__input::placeholder {
    color: var(--bone-dim);
  }
  .composer__input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /*
    Submit — borderless surface, the SysLabel `> SEND` carries the
    weight. Cursor + opacity flip on disabled mirrors IdleState.
  */
  .composer__submit {
    background: transparent;
    border: none;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    color: inherit;
  }
  .composer__submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
