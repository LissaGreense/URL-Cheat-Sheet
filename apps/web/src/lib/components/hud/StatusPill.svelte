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
  import { phosphorFlash } from '../../motion/phosphorFlash';

  type Props = {
    state: string;
    tone?: 'normal' | 'alarm' | 'dim';
  };

  let { state, tone = 'normal' }: Props = $props();

  // The phosphor flash colorizes per tone — alarm states pulse amber
  // (matches the `// INGEST_FAILED` choreography from spec §4.3),
  // everything else gets the default green-acid pulse.
  const flashColor = $derived(tone === 'alarm' ? 'var(--amber-alarm)' : 'var(--green-acid)');
</script>

<!--
  Two actions co-exist on the inner <span>:
    - `scrambleIn` writes + scrambles the state text on mount and re-fires
      on every `state` change (Task 9, ucs-eem managed-content contract).
    - `phosphorFlash` pulses on every `state` change (Task 10) —
      `trigger: state` re-fires the keyframe each transition like
      `[ STANDBY ]` → `[ READY ]`.
  The inner <span> intentionally has NO `{state}` interpolation —
  `scrambleIn` owns its text content (ucs-eem). If Svelte tracked a text
  node inside the span, GSAP's ScrambleTextPlugin would orphan it on the
  first mount and subsequent state changes would write to a detached node.
-->
<span
  class="status-pill"
  class:status-pill--alarm={tone === 'alarm'}
  class:status-pill--dim={tone === 'dim'}
>
  [ <span use:scrambleIn={{ text: state }} use:phosphorFlash={{ trigger: state, color: flashColor }}
  ></span> ]
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
