/**
 * `idleBreath` Svelte action — slow ambient yoyo-scale loop
 * (spec §3.3 choreography, plan Task 10).
 *
 * On mount, the action adds a CSS class to the node. That class is
 * wired to an `@keyframes idle-breath` rule (in `atmosphere.css`)
 * that scales `1.0 → scaleTo → 1.0` on a yoyo (`alternate` direction)
 * infinite loop. Duration and `scaleTo` are passed as CSS custom
 * properties so the keyframe rule reads them — one keyframe handles
 * every caller's tuning.
 *
 * Used on the corner version stamp and the glow pads so the page is
 * never fully at rest (spec §3.4 "always-alive rule"). Foreground
 * showpieces are additive over this ambient breath.
 *
 * Reduced-motion contract (ADR 0009):
 * When `prefers-reduced-motion: reduce` is set, the class is never
 * added and no custom properties are written. The element stays at
 * its resting scale of 1.0 (no transform is applied at rest).
 *
 * @see {@link ./_reducedMotion} for the SSR-safe media-query check.
 */
import type { ActionReturn } from 'svelte/action';
import { prefersReducedMotion } from './_reducedMotion';

/**
 * Params for `idleBreath`.
 *
 * @property scaleTo - The peak scale at the yoyo midpoint. Default
 *   `1.04` — visible at the edges, imperceptible in the center, which
 *   is exactly the "breathing" intent.
 * @property duration - Full single-direction duration in milliseconds.
 *   Default `8000ms`. Because the animation runs `alternate`, a full
 *   1.0 → 1.04 → 1.0 cycle takes 2× this value (16s for the default).
 */
export type IdleBreathParams = {
  scaleTo?: number;
  duration?: number;
};

/**
 * The CSS class that activates the `@keyframes idle-breath` rule.
 * Exported so tests can assert against it without duplicating the
 * string literal.
 */
export const IDLE_BREATH_CLASS = 'idle-breath';

const DEFAULT_SCALE_TO = 1.04;
const DEFAULT_DURATION_MS = 8000;
const DURATION_PROPERTY = '--idle-breath-duration';
const SCALE_PROPERTY = '--idle-breath-scale-to';

/**
 * Start the idle-breath loop on `node`.
 *
 * @param node - The element to animate.
 * @param params - Optional tuning — see {@link IdleBreathParams}.
 * @returns Svelte action handle. `destroy` removes the class so the
 *   animation stops on unmount (useful for HMR + state-based
 *   re-mounts so we don't leak detached animating elements).
 */
export function idleBreath(
  node: HTMLElement,
  params: IdleBreathParams = {}
): ActionReturn<IdleBreathParams> {
  // ADR 0009 strict fallback: no class, no custom props. The element
  // sits at scale(1) — the resting baseline.
  if (prefersReducedMotion()) {
    return { destroy: () => {} };
  }

  const scaleTo = params.scaleTo ?? DEFAULT_SCALE_TO;
  const duration = params.duration ?? DEFAULT_DURATION_MS;

  // Write tuning to custom properties so the single @keyframes rule
  // can be parameterized per element.
  node.style.setProperty(DURATION_PROPERTY, `${duration}ms`);
  node.style.setProperty(SCALE_PROPERTY, `${scaleTo}`);
  node.classList.add(IDLE_BREATH_CLASS);

  return {
    destroy(): void {
      node.classList.remove(IDLE_BREATH_CLASS);
    }
  };
}
