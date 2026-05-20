<!--
  ScanCard — the chrome wrapper for tool-call scans (spec §5, plan
  Task 5). Composes `HudPanel` + `SysLabel` (kind="header") + `StatusPill`
  to give every scan card identical chrome:

    - 0.5px hairline border + 8px backdrop blur (via HudPanel)
    - Header row: `// {toolName}` + `[ {status} ]`
    - Optional bottom-right `+++` tick cluster (via HudPanel `ticks`)
    - Optional bottom-right `!` error glyph (replaces ticks on faulted)
    - Caller-supplied children rendered below the header

  Phase 1 ships chrome only — interior animations (scanline sweep,
  compile bar) come in Phase 2 Task 11. The chrome stays static and
  Phase 2 layers motion via Svelte actions on the same selectors.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import HudPanel from '../hud/HudPanel.svelte';
  import StatusPill from '../hud/StatusPill.svelte';
  import SysLabel from '../hud/SysLabel.svelte';

  /**
   * Props for ScanCard.
   * @property {string} toolName - Header label (e.g. `GREP_DOC`, `FINALIZE`).
   *   Rendered verbatim — pass the already-uppercased form per the
   *   instrumentation convention.
   * @property {string} status - Status text rendered inside the pill
   *   (e.g. `SCANNING`, `COMPLETE`, `HALTED`, `FAULTED`).
   * @property {'normal' | 'alarm' | 'dim'} [statusTone='normal'] - Color
   *   tone forwarded to the StatusPill.
   * @property {boolean} [ticks=false] - Render the `+++` activity tick
   *   cluster. Suppressed automatically when `errorGlyph` is set.
   * @property {boolean} [errorGlyph=false] - Render the `!` glyph in the
   *   bottom-right (faulted scans). Replaces `ticks` when both are set.
   * @property {Snippet} children - Card interior. Specific scan visuals
   *   (`GrepDocScan`, `FinalizeScan`) compose ScanCard with their own
   *   markup as the snippet body.
   */
  type Props = {
    toolName: string;
    status: string;
    statusTone?: 'normal' | 'alarm' | 'dim';
    ticks?: boolean;
    errorGlyph?: boolean;
    children: Snippet;
  };

  let {
    toolName,
    status,
    statusTone = 'normal',
    ticks = false,
    errorGlyph = false,
    children
  }: Props = $props();

  // `errorGlyph` and `ticks` are mutually exclusive — spec §5.3 says the
  // `!` glyph appears "in the bottom-right where `+++` was". A `$derived`
  // keeps the suppression rule colocated with the prop reads.
  const showTicks = $derived(ticks && !errorGlyph);
</script>

<div class="scan-card">
  <HudPanel ticks={showTicks}>
    <div class="scan-card__header">
      <SysLabel kind="header">{toolName}</SysLabel>
      <StatusPill state={status} tone={statusTone} />
    </div>

    <div class="scan-card__body">
      {@render children()}
    </div>

    {#if errorGlyph}
      <span class="scan-card__error-glyph" aria-hidden="true">!</span>
    {/if}
  </HudPanel>
</div>

<style>
  /*
    Header row — sys-voice label left, status pill right. Flex so the
    pill stays right-anchored regardless of the label length.
  */
  .scan-card__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  /*
    The body sits below the header. Specific scans drive their own
    interior layout — this rule only owns the spacing rhythm.
  */
  .scan-card__body {
    position: relative;
  }

  /*
    Error glyph — same anchor as HudPanel's `+++` tick cluster so the
    visual position is identical when the chrome swaps states.
  */
  .scan-card__error-glyph {
    position: absolute;
    bottom: 4px;
    right: 8px;
    font-family: var(--font-body);
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    color: var(--amber-alarm);
    pointer-events: none;
  }
</style>
