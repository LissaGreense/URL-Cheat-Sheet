<!--
  FlaggedState — the cinematic "source caveat" screen (spec §4.4, plan
  Task 4).

  Critical taste decision (called out in the spec, the plan, and the
  ucs-9g9 brief): this state stays in memex voice — NOT alarm voice.
  The page may contain prompt-injection patterns, but the UI doesn't
  scream about it. The header is bone-colored, the HudPanel is the
  default variant (no amber), and the StatusPill is `normal` tone.
  Severity bars use `--green-acid` (the curator's instrumentation
  palette), not amber. The voice is curatorial, not weaponized.

  Layout:
    - `// SOURCE_CAVEAT` top-left header (bone, memex voice).
    - `<HudPanel>` (default variant) containing 3 sys-voice metadata
      rows (`> title:`, `> url:`, `> detected:`) and a threat list.
      Each threat is a row with the threat type and a 1px-tall
      severity bar (width = severity * 100%, color = `--green-acid`).
    - `<StatusPill state="REVIEW_REQUIRED">` (normal tone).
    - Two CTAs: `> CONTINUE_ANYWAY` (fires onContinue) and
      `> NEW_SOURCE` (fires onReset).
    - `<CornerStamp text="001 SESSION" position="bottom-right">`.
-->
<script lang="ts">
  import HudPanel from '../hud/HudPanel.svelte';
  import StatusPill from '../hud/StatusPill.svelte';
  import SysLabel from '../hud/SysLabel.svelte';
  import CornerStamp from '../hud/CornerStamp.svelte';
  import type { ExtractResponse } from '@url-cheat-sheet/schemas';

  /**
   * Props for FlaggedState.
   * @property {ExtractResponse} preview - The full extract response with
   *   `scan.safe === false`. The component reads `title`, `sourceUrl`,
   *   and `scan.threats` for display; the parent's `confirmFlagged()`
   *   handler reuses the same preview to transition to `ready`.
   * @property {() => void} onContinue - Click handler for `CONTINUE_ANYWAY`.
   *   Parent wires to `confirmFlagged()`.
   * @property {() => void} onReset - Click handler for `NEW_SOURCE`.
   *   Parent wires to `reset()`.
   */
  type Props = {
    preview: ExtractResponse;
    onContinue: () => void;
    onReset: () => void;
  };

  let { preview, onContinue, onReset }: Props = $props();
</script>

<CornerStamp text="001 SESSION" position="bottom-right" />

<div class="flagged-header">
  <SysLabel kind="header">SOURCE_CAVEAT</SysLabel>
</div>

<div class="flagged-state">
  <HudPanel>
    <div class="flagged-panel-body">
      <div class="flagged-meta">
        <div class="flagged-meta__row">
          <SysLabel kind="action">title:</SysLabel>
          <span class="flagged-meta__value">{preview.title}</span>
        </div>
        <div class="flagged-meta__row">
          <SysLabel kind="action">url:</SysLabel>
          <span class="flagged-meta__value flagged-meta__value--url">{preview.sourceUrl}</span>
        </div>
        <div class="flagged-meta__row">
          <SysLabel kind="action">detected:</SysLabel>
          <span class="flagged-meta__value">{preview.scan.threats.length} pattern(s)</span>
        </div>
      </div>

      <ul class="flagged-threats">
        {#each preview.scan.threats as threat, i (threat.type + i)}
          <li class="flagged-threat" data-testid="threat-row">
            <span class="flagged-threat__type">{threat.type}</span>
            <div class="flagged-threat__bar-track" aria-hidden="true">
              <div
                class="flagged-threat__bar"
                data-testid="threat-bar"
                style="width: {threat.severity * 100}%"
              ></div>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </HudPanel>

  <StatusPill state="REVIEW_REQUIRED" />

  <div class="flagged-actions">
    <button type="button" class="flagged-action" data-testid="continue-btn" onclick={onContinue}>
      <SysLabel kind="action">CONTINUE_ANYWAY</SysLabel>
    </button>
    <button type="button" class="flagged-action" data-testid="reset-btn" onclick={onReset}>
      <SysLabel kind="action">NEW_SOURCE</SysLabel>
    </button>
  </div>
</div>

<style>
  /*
    Layout mirrors the other state components — centered column with
    top-left fixed header and bottom-right corner stamp.
  */
  .flagged-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 4rem 2rem;
    gap: 1.5rem;
  }

  .flagged-header {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 1;
  }

  .flagged-panel-body {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-width: min(36rem, 80vw);
  }

  /*
    Metadata block — each row is `> label: value` with the SysLabel
    sys-voice prefix and the value in body sans. Keeps rows aligned
    on the value column.
  */
  .flagged-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .flagged-meta__row {
    display: flex;
    align-items: baseline;
    gap: 0.75ch;
    flex-wrap: wrap;
  }

  .flagged-meta__value {
    font-family: var(--font-body);
    font-size: 0.9rem;
    line-height: 1.4;
    color: var(--bone);
  }
  /*
    Long URLs need to break, otherwise the panel grows past its
    `min-width` cap on narrow viewports.
  */
  .flagged-meta__value--url {
    word-break: break-all;
  }

  /*
    Threat list — borderless, no bullets. Each row stacks the type
    label over a thin severity track.
  */
  .flagged-threats {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .flagged-threat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .flagged-threat__type {
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--bone-dim);
  }

  /*
    Severity bar — 1px-tall track in the dim hairline color, with the
    actual bar in `--green-acid` (curator's palette, NOT amber — this
    is the memex-voice contract). Width is set inline per row.
  */
  .flagged-threat__bar-track {
    height: 1px;
    width: 100%;
    background: var(--hair);
    overflow: hidden;
  }

  .flagged-threat__bar {
    height: 100%;
    background: var(--green-acid);
  }

  /*
    Action buttons — borderless surfaces so the SysLabel `> CONTINUE_ANYWAY`
    / `> NEW_SOURCE` labels carry the visual weight (same pattern as
    IdleState's INGEST submit and ExtractErrorState's NEW_SOURCE reset).
  */
  .flagged-actions {
    display: flex;
    gap: 1rem;
  }

  .flagged-action {
    background: transparent;
    border: none;
    padding: 0.5rem 1rem;
    cursor: pointer;
    color: inherit;
  }
</style>
