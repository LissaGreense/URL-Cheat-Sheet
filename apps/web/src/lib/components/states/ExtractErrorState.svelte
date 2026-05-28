<!--
  ExtractErrorState — the cinematic "ingest failed" screen (spec §4.3,
  plan Task 4).

  Phase 1 contract (no motion — Phase 2 layers phosphorFlash + scrambleIn):
    - `// INGEST_FAILED` top-left header in `--amber-alarm` (the ONLY
      place in the entire UI this color appears; the SysLabel default
      color is overridden via the `.extract-error-header__label` wrapper).
    - `<HudPanel variant="alarm">` containing the humanized error message
      (body sans) and the error code (sys-voice micro-caps below).
    - `<StatusPill state="HALTED" tone="alarm">`.
    - `<button>` wrapping `<SysLabel kind="action">NEW_SOURCE</SysLabel>`
      wired to the parent's `onReset` (state machine's `reset()`).
    - `<CornerStamp text="001 SESSION" position="bottom-right">`.

  Tone: hostile-warning. Amber is rationed — this is the only state
  that surfaces it. By contrast `FlaggedState` (§4.4) stays in memex
  voice with bone-colored labels.
-->
<script lang="ts">
  import HudPanel from '../hud/HudPanel.svelte';
  import StatusPill from '../hud/StatusPill.svelte';
  import SysLabel from '../hud/SysLabel.svelte';
  import CornerStamp from '../hud/CornerStamp.svelte';
  import { phosphorFlash } from '../../motion/phosphorFlash';
  import { scrambleIn } from '../../motion/scrambleIn';

  /**
   * Props for ExtractErrorState.
   * @property {string} message - Already-humanized error message
   *   (the parent's `humanizeError(ExtractError)` output). Rendered
   *   verbatim in body sans.
   * @property {string} errorCode - The raw `ExtractError['kind']` value
   *   (e.g. `'FETCH_TIMEOUT'`). Rendered in sys-voice micro-caps below
   *   the message so users can quote it in bug reports.
   * @property {() => void} onReset - Click handler for the `NEW_SOURCE`
   *   CTA. Wired by the parent to the state machine's `reset()`.
   */
  type Props = {
    message: string;
    errorCode: string;
    onReset: () => void;
  };

  let { message, errorCode, onReset }: Props = $props();
</script>

<CornerStamp text="001 SESSION" position="bottom-right" />

<!--
  `phosphorFlash` on the `// INGEST_FAILED` header (Task 13, spec §4.3).
  Single amber pulse on mount — `trigger: errorCode` re-fires the
  keyframe if the same component remounts for a different error code
  without an intervening state swap. Color is amber (`--amber-alarm`)
  to match the only amber surface in the entire UI.
-->
<div
  class="extract-error-header"
  use:phosphorFlash={{ trigger: errorCode, color: 'var(--amber-alarm)' }}
>
  <span class="extract-error-header__label">
    <SysLabel kind="header">INGEST_FAILED</SysLabel>
  </span>
</div>

<div class="extract-error-state">
  <HudPanel variant="alarm">
    <div class="extract-error-panel-body">
      <p class="extract-error-message">{message}</p>
      <!--
        `scrambleIn` on the error code (Task 13, spec §4.3). The code
        is a pure-text leaf; the action owns its content per the
        ucs-eem managed-content contract — pass via `text:`, not as a
        Svelte child. Plays once on mount; a fresh ExtractErrorState
        mount (new error) re-runs it, and an in-place errorCode change
        re-fires the scramble via the action's `update`.
      -->
      <span
        class="extract-error-code"
        data-testid="extract-error-code"
        use:scrambleIn={{ text: errorCode }}
      ></span>
    </div>
  </HudPanel>

  <StatusPill state="HALTED" tone="alarm" />

  <button type="button" class="extract-error-reset" onclick={onReset}>
    <SysLabel kind="action">NEW_SOURCE</SysLabel>
  </button>
</div>

<style>
  /*
    Layout mirrors IdleState / ExtractingState — centered column with
    top-left fixed header and bottom-right corner stamp. Vertical rhythm
    tightens slightly so the error screen feels arrested, not roomy.
  */
  .extract-error-state {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 4rem 2rem;
    gap: 1.5rem;
  }

  /*
    `// INGEST_FAILED` lives in the top-left gutter — same inset as
    IdleState's `// AWAITING_SOURCE` and ExtractingState's
    `// INGESTING_SOURCE` headers so the four corners line up visually
    across all states.
  */
  .extract-error-header {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 1;
  }

  /*
    Amber tint on the `// INGEST_FAILED` header. SysLabel is generic
    (bone by default); this wrapper overrides the inherited `color`
    via the `:global` descendant escape — Svelte scopes the wrapper
    class but the SysLabel internals live in the child component's
    own scoped stylesheet. The cascade picks up the wrapper's color
    via inheritance on `.sys-label` and `.sys-label__prefix`.

    Spec §4.3 calls out: this is the ONLY place `--amber-alarm`
    appears on a label in the entire UI.
  */
  .extract-error-header__label {
    color: var(--amber-alarm);
  }
  .extract-error-header__label :global(.sys-label),
  .extract-error-header__label :global(.sys-label__prefix) {
    color: var(--amber-alarm);
  }

  /*
    Panel body — message stacked vertically over the error code. The
    code is sys-voice (caps + tracking) so it reads as machine-quoted
    metadata, not body copy.
  */
  .extract-error-panel-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
    max-width: 36rem;
  }

  .extract-error-message {
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.5;
    color: var(--bone);
    margin: 0;
  }

  /*
    Error code in sys-voice micro-caps (spec §2.2 row 3). Dim color
    keeps it secondary to the human message above.
  */
  .extract-error-code {
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--bone-dim);
  }

  /*
    Reset CTA — borderless button so the SysLabel `> NEW_SOURCE` carries
    the visual weight (same pattern as IdleState's `> INGEST` submit).
  */
  .extract-error-reset {
    background: transparent;
    border: none;
    padding: 0.5rem 1rem;
    cursor: pointer;
    color: inherit;
  }
</style>
