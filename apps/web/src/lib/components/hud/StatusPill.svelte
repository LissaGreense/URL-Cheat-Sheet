<!--
  StatusPill — bracketed status indicator from spec §2.4
  ("[ STATE ]" instrumentation form, e.g. `[ READY ]`, `[ SCANNING ]`,
  `[ HALTED ]`).

  Sys-voice register (spec §2.2): body family, 400, 10–12px caps,
  +0.84–1.2px tracking, line-height 1.2. The `tone` prop swaps the
  text color via a class flag — Phase 2 motion (phosphorFlash on state
  transition) attaches to the same `.status-pill` selector via a
  Svelte action without changing this markup.
-->
<script lang="ts">
  /**
   * Props for StatusPill.
   * @property {string} state - The status text (e.g. 'READY', 'SCANNING',
   *   'HALTED'). Rendered verbatim inside `[ ]` brackets, so callers
   *   should pass the already-uppercased form per the instrumentation
   *   convention.
   * @property {'normal' | 'alarm' | 'dim'} [tone='normal'] - Color tone:
   *   - `normal` → `--bone` (default foreground)
   *   - `alarm`  → `--amber-alarm` (rationed warm; error states only)
   *   - `dim`    → `--bone-dim` (secondary, e.g. idle `[ STANDBY ]`)
   */
  import { scrambleIn } from '../../motion/scrambleIn';

  type Props = {
    state: string;
    tone?: 'normal' | 'alarm' | 'dim';
  };

  let { state, tone = 'normal' }: Props = $props();
</script>

<span
  class="status-pill"
  class:status-pill--alarm={tone === 'alarm'}
  class:status-pill--dim={tone === 'dim'}
>
  [ <span use:scrambleIn>{state}</span> ]
</span>

<style>
  /*
    Sys-voice typography (spec §2.2). Caps + wide tracking is what
    makes the pill read as instrumented; no monospace family — the
    "mono feeling" comes from tracking alone.
  */
  .status-pill {
    display: inline-block;
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--bone);
    white-space: nowrap;
  }

  .status-pill--alarm {
    color: var(--amber-alarm);
  }

  .status-pill--dim {
    color: var(--bone-dim);
  }
</style>
