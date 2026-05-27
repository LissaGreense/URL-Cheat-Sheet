/**
 * `splitLineReveal` Svelte action — cinematic line-by-line reveal
 * primitive (spec §3.3 choreography, plan Task 9).
 *
 * On mount, the action splits the element's text into `<div>` line
 * wrappers via GSAP's `SplitText` plugin, then animates each line's
 * `clip-path` from `inset(0 0 100% 0)` (fully clipped from the bottom)
 * to its default value (fully revealed) with a staggered cubic-bezier
 * ease. The effect reads as text "wiping in" from the top, one line at
 * a time — the signature reveal for the idle directive.
 *
 * Reduced-motion contract (ADR 0009):
 * When `prefers-reduced-motion: reduce` is set, NEITHER SplitText NOR
 * the GSAP tween runs. The text stays as-is on the node (the original
 * `innerHTML` is already at the final visual state — no transform was
 * applied). `destroy` is a no-op.
 *
 * Destroy contract:
 * `splitText.revert()` MUST run on `destroy` to restore the original
 * DOM — otherwise the line-wrapper `<div>`s leak into the tree on
 * component unmount mid-animation. Without `.revert()`, repeated
 * mounts (e.g. via state transitions) would accrue stale wrappers.
 *
 * GSAP unit conversion: GSAP's `duration`, `delay`, and `stagger`
 * accept SECONDS. The action's params are in ms (matching `--dur-reveal`
 * et al. in `tokens.css`) and convert at the boundary.
 *
 * Plugin registration (`SplitText`) is the layout's responsibility —
 * `registerGsap()` runs in `+layout.svelte`. This action assumes the
 * plugin is already live.
 *
 * @see {@link ./_reducedMotion} for the SSR-safe media-query check.
 * @see {@link ./registerGsap} for one-time plugin registration.
 */
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import type { ActionReturn } from 'svelte/action';
import { EASE_OUT_EXPO } from './_curves';
import { prefersReducedMotion } from './_reducedMotion';

/**
 * Params for `splitLineReveal`.
 *
 * @property stagger - Per-line offset in milliseconds. Default 60ms —
 *   tight enough that a 3-line block resolves inside ~1s, slow enough
 *   that each line reads as a distinct moment.
 * @property duration - Per-line reveal duration in milliseconds.
 *   Default 800ms (matches `--dur-reveal`).
 * @property delay - Start delay in milliseconds before the first line
 *   begins revealing. Default 0ms.
 */
export type SplitLineRevealParams = {
  stagger?: number;
  duration?: number;
  delay?: number;
};

const DEFAULT_STAGGER_MS = 60;
const DEFAULT_DURATION_MS = 800;
const DEFAULT_DELAY_MS = 0;

/**
 * Apply a split-line reveal to `node` on mount.
 *
 * @param node - The element whose text should be split + revealed line
 *   by line.
 * @param params - Optional tuning — see {@link SplitLineRevealParams}.
 * @returns Svelte action handle. `destroy` calls `revert()` on the
 *   SplitText instance to unbox the line wrappers.
 */
export function splitLineReveal(
  node: HTMLElement,
  params: SplitLineRevealParams = {}
): ActionReturn<SplitLineRevealParams> {
  // ADR 0009 strict fallback: in reduced-motion mode, the text is
  // already fully visible on the node. Skip SplitText (which would
  // mutate the DOM) and skip the GSAP tween entirely.
  if (prefersReducedMotion()) {
    return { destroy: () => {} };
  }

  const stagger = params.stagger ?? DEFAULT_STAGGER_MS;
  const duration = params.duration ?? DEFAULT_DURATION_MS;
  const delay = params.delay ?? DEFAULT_DELAY_MS;

  const split = new SplitText(node, { type: 'lines' });

  gsap.from(split.lines, {
    clipPath: 'inset(0 0 100% 0)',
    duration: duration / 1000,
    delay: delay / 1000,
    stagger: stagger / 1000,
    ease: EASE_OUT_EXPO
  });

  return {
    destroy: () => {
      // Critical: restore the original DOM so line wrappers don't
      // leak on unmount. Without this, every mount of a parent state
      // would stack stale `<div>` wrappers.
      split.revert();
    }
  };
}
