/**
 * `phosphorFlash` Svelte action — a one-shot CSS keyframe pulse
 * (spec §3.3 choreography, plan Task 10).
 *
 * On mount and on every `trigger`-value change, the action briefly adds
 * a CSS class to the node that runs a `box-shadow` / `filter` keyframe
 * defined in `tokens.css` (`@keyframes phosphor-flash`). After
 * `duration` ms the class is removed so the next trigger change can
 * re-add it and the keyframe re-fires from the top.
 *
 * Used by `StatusPill` to flash on state transitions
 * (`[ STANDBY ]` → `[ READY ]`), and by error states (`tone="alarm"`
 * + `color: 'var(--amber-alarm)'`) for the `// INGEST_FAILED` pulse.
 *
 * Reduced-motion contract (ADR 0009):
 * When `prefers-reduced-motion: reduce` is set, the action is a pure
 * no-op. The class is never added; `destroy`/`update` do nothing.
 *
 * Color knob:
 * `color` is written to a CSS custom property (`--phosphor-flash-color`)
 * on the node so the same `@keyframes` rule can pulse green for normal
 * transitions, amber for error/alarm pulses, etc., without needing one
 * keyframe per color.
 *
 * Trigger semantics:
 * `trigger: unknown` — any value works (string, number, object). The
 * action re-fires when the value !== the previous one (strict equality;
 * passing a new object reference every render WILL re-fire each time —
 * that's a caller bug, pass a stable scalar like `state`).
 *
 * @see {@link ./_reducedMotion} for the SSR-safe media-query check.
 */
import type { ActionReturn } from 'svelte/action';
import { prefersReducedMotion } from './_reducedMotion';

/**
 * Params for `phosphorFlash`.
 *
 * @property trigger - Any value; the flash re-fires whenever this value
 *   changes (strict-equality comparison). Pass a stable scalar — e.g.
 *   the `state` prop — not a fresh object literal per render.
 * @property duration - Flash duration in milliseconds. Default 280ms.
 *   Must match (or exceed) the `@keyframes phosphor-flash` duration in
 *   `tokens.css` — the class needs to stay on long enough for the
 *   keyframe to complete, then come off so re-add re-fires.
 * @property color - Color used as the flash tint. Written to the
 *   `--phosphor-flash-color` custom property on the node so the CSS
 *   keyframe can reference `var(--phosphor-flash-color)`. Default
 *   `'var(--green-acid)'`. Pass `'var(--amber-alarm)'` for error pulses.
 */
export type PhosphorFlashParams = {
  trigger: unknown;
  duration?: number;
  color?: string;
};

/**
 * The CSS class that runs the `@keyframes phosphor-flash` rule. Exported
 * so tests can assert against it without duplicating the string literal.
 */
export const PHOSPHOR_FLASH_CLASS = 'phosphor-flash';

const DEFAULT_DURATION_MS = 280;
const DEFAULT_COLOR = 'var(--green-acid)';
const COLOR_PROPERTY = '--phosphor-flash-color';

/**
 * Apply a one-shot phosphor flash to `node` on mount and on every
 * `trigger`-value change.
 *
 * @param node - The element to flash.
 * @param params - Trigger value plus optional tuning — see
 *   {@link PhosphorFlashParams}.
 * @returns Svelte action handle. `update` re-fires on trigger change;
 *   `destroy` cancels any pending class-removal so a stale timeout
 *   cannot touch a detached node.
 */
export function phosphorFlash(
  node: HTMLElement,
  params: PhosphorFlashParams
): ActionReturn<PhosphorFlashParams> {
  // ADR 0009 strict fallback: no listeners, no class, no timers in
  // reduced-motion mode. The element stays at its resting visual.
  if (prefersReducedMotion()) {
    return {
      destroy: () => {},
      update: () => {}
    };
  }

  let lastTrigger = params.trigger;
  let pendingRemoval: ReturnType<typeof setTimeout> | null = null;

  /**
   * Fire one flash: write the color, add the class, schedule its
   * removal. Cancels any in-flight removal so back-to-back triggers
   * don't strand the class on the node.
   */
  function fire(color: string, duration: number): void {
    if (pendingRemoval !== null) {
      clearTimeout(pendingRemoval);
      pendingRemoval = null;
    }
    node.style.setProperty(COLOR_PROPERTY, color);
    // Force a class-toggle off→on so the keyframe restarts even when
    // the class is already present (browsers will not restart a CSS
    // animation if the same class is already on the element).
    node.classList.remove(PHOSPHOR_FLASH_CLASS);
    // Reading offsetWidth forces a synchronous reflow so the
    // class-removal is committed before the re-add — without it the
    // browser would batch both mutations into one frame and skip the
    // keyframe restart. jsdom ignores this (no layout), so tests still
    // pass without it; the read is for real browsers.
    void node.offsetWidth;
    node.classList.add(PHOSPHOR_FLASH_CLASS);
    pendingRemoval = setTimeout(() => {
      node.classList.remove(PHOSPHOR_FLASH_CLASS);
      pendingRemoval = null;
    }, duration);
  }

  // Fire on mount.
  fire(params.color ?? DEFAULT_COLOR, params.duration ?? DEFAULT_DURATION_MS);

  return {
    update(next: PhosphorFlashParams): void {
      if (next.trigger === lastTrigger) return;
      lastTrigger = next.trigger;
      fire(next.color ?? DEFAULT_COLOR, next.duration ?? DEFAULT_DURATION_MS);
    },
    destroy(): void {
      if (pendingRemoval !== null) {
        clearTimeout(pendingRemoval);
        pendingRemoval = null;
      }
    }
  };
}
