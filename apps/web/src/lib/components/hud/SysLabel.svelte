<!--
  SysLabel — the `// HEADER` and `> action` voice helpers from spec
  §2.4 instrumentation vocabulary.

  Always renders sys-voice typography (spec §2.2 row 3): body family,
  weight 400, 10–12px caps, +0.84–1.2px tracking, line-height 1.2.
  This is the load-bearing typographic decision — the "instrumented"
  feel comes entirely from wide-tracked tiny caps, no monospace family.

  Prefix glyph is its own span (`.sys-label__prefix`) so Phase 2 can
  target it independently — e.g. a scrambleIn action on the label
  while the prefix stays still — without re-marking the DOM.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Props for SysLabel.
   * @property {'header' | 'action'} kind - Voice form:
   *   - `header` → `// LABEL_NAME` (section headers, state names)
   *   - `action` → `> action_name` (action prompts, user-message prefix)
   * @property {Snippet} children - The label content. Pass the label as
   *   already-uppercased text per the instrumentation convention; this
   *   component does not transform case — CSS `text-transform` handles
   *   any rendering normalization.
   */
  type Props = {
    kind: 'header' | 'action';
    children: Snippet;
  };

  let { kind, children }: Props = $props();

  // `$derived` so the prefix tracks `kind` if the parent updates it
  // (a plain `const` only captures the initial value — Svelte 5 warns).
  const prefix = $derived(kind === 'header' ? '//' : '>');
</script>

<span
  class="sys-label"
  class:sys-label--header={kind === 'header'}
  class:sys-label--action={kind === 'action'}
>
  <span class="sys-label__prefix" aria-hidden="true">{prefix}</span>
  <span class="sys-label__body">{@render children()}</span>
</span>

<style>
  /*
    Sys-voice typography (spec §2.2). Both kinds share the register;
    the visible distinction is the prefix glyph only.
  */
  .sys-label {
    display: inline-flex;
    align-items: baseline;
    gap: 0.5ch;
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--bone);
  }

  .sys-label__prefix {
    color: var(--bone-dim);
  }
</style>
