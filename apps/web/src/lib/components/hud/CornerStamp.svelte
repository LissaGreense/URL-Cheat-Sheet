<!--
  CornerStamp — the persistent fixed-corner version stamp from spec
  §2.4 (`001 SESSION`, bottom-right, "never leaves"). Generalized so
  the same primitive can anchor any sys-voice text to any of the four
  viewport corners (top-left state header, etc.).

  Positioning is `position: fixed` and the top/right/bottom/left
  insets are set inline (via the `style` attribute) keyed off the
  `position` prop. Inline styles let jsdom-based tests observe the
  anchor without resolved-CSS support; visually it's identical to
  scoped CSS.
-->
<script lang="ts">
  /**
   * Props for CornerStamp.
   * @property {string} text - The stamp text (e.g. '001 SESSION').
   *   Rendered verbatim in sys-voice typography — pass the
   *   already-uppercased form per the instrumentation convention.
   * @property {'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'} position
   *   Which viewport corner to anchor to.
   */
  import { idleBreath } from '../../motion/idleBreath';

  type Props = {
    text: string;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };

  let { text, position }: Props = $props();

  // Inset distance from the viewport edge. Single value keeps the four
  // corners visually symmetric; tweakable later via a token if needed.
  const GUTTER = '1rem';

  /**
   * Build the inline-style anchor string for the given corner. Only
   * the two relevant axes (top|bottom + left|right) are set — the
   * other two stay unset so `el.style.top === ''` etc. is observable
   * in tests and resolves to `auto` at runtime.
   */
  const anchor = $derived.by(() => {
    switch (position) {
      case 'top-left':
        return `position: fixed; top: ${GUTTER}; left: ${GUTTER};`;
      case 'top-right':
        return `position: fixed; top: ${GUTTER}; right: ${GUTTER};`;
      case 'bottom-left':
        return `position: fixed; bottom: ${GUTTER}; left: ${GUTTER};`;
      case 'bottom-right':
        return `position: fixed; bottom: ${GUTTER}; right: ${GUTTER};`;
    }
  });
</script>

<!--
  `use:idleBreath` keeps the stamp gently scaling (1.0 → 1.04, 8s) so
  the persistent corner anchor reads as "alive" per spec §3.4. Pure
  CSS — no listeners. ADR 0009: reduced-motion users see a static stamp.
-->
<span class="corner-stamp" style={anchor} use:idleBreath>{text}</span>

<style>
  /*
    Sys-voice typography (spec §2.2). Stamp sits above the atmosphere
    layers (which use negative z-index) without needing its own
    z-index — `position: fixed` + default stacking already wins.
  */
  .corner-stamp {
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 11px;
    line-height: 1.2;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--bone-dim);
    pointer-events: none;
    user-select: none;
  }
</style>
