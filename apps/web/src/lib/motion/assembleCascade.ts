/**
 * `assembleCascade` Svelte action — the cinematic memex HUD's
 * `finalize` compile-bar primitive (spec §5.2, plan Task 11).
 *
 * On mount and on every `update`, the action drives two visuals:
 *
 *   1. **Compile bar growth.** A child `.compile-bar` element's `height`
 *      animates to `(streamedChars / totalEstimatedChars) * 100%`,
 *      capped at 100%. GSAP-driven `gsap.to` for the tween.
 *
 *   2. **Per-line scramble.** A MutationObserver watches a child
 *      `.finalize__content` (or `[data-cascade-text]` fallback) for
 *      added `.finalize__line` nodes. Each new line gets a
 *      `scrambleIn`-style scramble (~180ms) so text reads as arriving
 *      from behind the compile bar's leading edge.
 *
 * Reduced-motion contract (ADR 0009):
 * When `prefers-reduced-motion: reduce` is set, the action is a pure
 * inline-style writer for the bar (no GSAP scheduling, no MutationObserver,
 * no scrambles). The bar's `height` is set directly so users still see
 * an instant progress indicator without any animation.
 *
 * Defensive on missing children:
 * If `.compile-bar` is not found on the host, the action no-ops
 * gracefully — same convention as `scanSweep`. The MutationObserver is
 * only wired when a text container exists; if it doesn't, per-line
 * scramble is silently skipped.
 *
 * Lifecycle:
 *   - `update` re-computes the ratio and tweens the bar. Per-line
 *     scrambles fire asynchronously via the observer.
 *   - `destroy` disconnects the observer so callbacks don't fire on a
 *     detached node.
 *
 * GSAP unit conversion: GSAP's `duration` accepts SECONDS. The internal
 * bar-tween duration is in ms and converts at the boundary.
 *
 * @see {@link ./scrambleIn} — reused for per-line text reveal.
 * @see {@link ./_reducedMotion} for the SSR-safe media-query check.
 */
import { gsap } from 'gsap';
import type { ActionReturn } from 'svelte/action';
import { prefersReducedMotion } from './_reducedMotion';
import { scrambleIn } from './scrambleIn';

/**
 * Params for `assembleCascade`.
 *
 * @property streamedChars - Current count of streamed characters. The
 *   action reads this on every `update` and tweens the compile bar's
 *   height to `streamedChars / totalEstimatedChars`.
 * @property totalEstimatedChars - The denominator. Callers should keep
 *   this monotonically non-decreasing (running max + buffer) so the
 *   bar never visibly retreats. If `totalEstimatedChars <= 0`, the
 *   ratio is treated as 0 (no divide-by-zero, no NaN).
 */
export type AssembleCascadeParams = {
  streamedChars: number;
  totalEstimatedChars: number;
};

/**
 * Compile-bar child selector. Exported so consuming components (and
 * tests) can reference the canonical literal rather than retyping it.
 */
export const COMPILE_BAR_SELECTOR = '.compile-bar';

/**
 * Text container selector. The MutationObserver watches this element
 * for added `.finalize__line` nodes. Falls back to
 * `[data-cascade-text]` so callers can opt out of the class-based
 * convention if needed.
 */
export const TEXT_CONTAINER_SELECTOR = '.finalize__content, [data-cascade-text]';

/**
 * Per-line node selector. Only direct children matching this selector
 * are scrambled; arbitrary added nodes (e.g. the citations footer) are
 * ignored.
 */
export const LINE_SELECTOR = '.finalize__line';

const BAR_TWEEN_DURATION_MS = 240;
const PER_LINE_SCRAMBLE_MS = 180;

const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Compute the `height: NN%` string for the compile bar from the
 * current streamed/total ratio. Treats `total <= 0` as zero (no NaN,
 * no divide-by-zero) and caps the result at 100%.
 */
function ratioToHeightPct(streamed: number, total: number): string {
  if (total <= 0) return '0%';
  const ratio = Math.min(1, Math.max(0, streamed / total));
  // Multiply once + round to two decimals so the inline-style string
  // stays compact (the browser doesn't care, but tests + DOM inspectors do).
  const pct = Math.round(ratio * 10000) / 100;
  return `${pct}%`;
}

/**
 * Apply the compile-bar tween + per-line scramble to `node` on mount
 * and on every `update`.
 *
 * @param node - The host element. The action looks up the
 *   `.compile-bar` + text container as descendants.
 * @param params - Current stream progress — see {@link AssembleCascadeParams}.
 * @returns Svelte action handle. `update` re-tweens; `destroy`
 *   disconnects the observer.
 */
export function assembleCascade(
  node: HTMLElement,
  params: AssembleCascadeParams
): ActionReturn<AssembleCascadeParams> {
  const bar = node.querySelector<HTMLElement>(COMPILE_BAR_SELECTOR);

  if (bar === null) {
    return {
      destroy: () => {},
      update: () => {}
    };
  }

  const reduced = prefersReducedMotion();

  /**
   * Drive the bar to the current ratio. In motion mode, GSAP tweens
   * `height`; in reduced mode, we write the inline style directly so
   * users see an instant progress indicator without any animation.
   */
  function applyBarHeight(streamed: number, total: number): void {
    const height = ratioToHeightPct(streamed, total);
    if (reduced) {
      bar!.style.height = height;
      return;
    }
    gsap.to(bar, {
      height,
      duration: BAR_TWEEN_DURATION_MS / 1000,
      ease: EASE_OUT_EXPO,
      overwrite: 'auto'
    });
  }

  // Initial paint.
  applyBarHeight(params.streamedChars, params.totalEstimatedChars);

  // Per-line scramble: only wire the observer in motion mode. Reduced
  // motion lets each new line appear at rest without any text effect.
  let observer: MutationObserver | null = null;
  if (!reduced) {
    const textContainer = node.querySelector<HTMLElement>(TEXT_CONTAINER_SELECTOR);
    if (textContainer !== null) {
      observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const added of Array.from(record.addedNodes)) {
            // Element nodes only — text nodes inside the container
            // (e.g. whitespace) are not scrambled.
            if (added.nodeType !== Node.ELEMENT_NODE) continue;
            const el = added as Element;
            if (!el.matches(LINE_SELECTOR)) continue;
            scrambleIn(el as HTMLElement, { duration: PER_LINE_SCRAMBLE_MS });
          }
        }
      });
      observer.observe(textContainer, { childList: true });
    }
  }

  return {
    update(next: AssembleCascadeParams): void {
      applyBarHeight(next.streamedChars, next.totalEstimatedChars);
    },
    destroy(): void {
      if (observer !== null) {
        observer.disconnect();
        observer = null;
      }
    }
  };
}
