/**
 * `scrambleIn` Svelte action — the cinematic memex HUD's text-scramble
 * primitive (spec §3.3 choreography, plan Task 9).
 *
 * On mount, the action captures the element's current `textContent`,
 * then asks GSAP's `ScrambleTextPlugin` to "resolve" the text by
 * scrambling through random characters before settling on the captured
 * value. Used by the status pill so transitions like `[ STANDBY ]` →
 * `[ READY ]` read as instrumented terminal output, not a plain swap.
 *
 * Reduced-motion contract (ADR 0009):
 * When `prefers-reduced-motion: reduce` is set, the action is a no-op —
 * the captured text is already on the node, so we simply skip GSAP and
 * return a no-op `destroy`. No animation runtime touches the DOM in
 * reduced mode.
 *
 * GSAP unit conversion: GSAP's `duration` and `delay` accept SECONDS,
 * not milliseconds. The action's params are in ms (matching the design
 * tokens in `tokens.css`) and convert at the boundary.
 *
 * Plugin registration is the layout's responsibility (`registerGsap()`
 * runs once on mount in `+layout.svelte`); this action assumes
 * `ScrambleTextPlugin` is already live.
 *
 * @see {@link ./_reducedMotion} for the SSR-safe media-query check.
 * @see {@link ./registerGsap} for one-time plugin registration.
 */
import { gsap } from 'gsap';
import type { ActionReturn } from 'svelte/action';
import { prefersReducedMotion } from './_reducedMotion';

/**
 * Params for `scrambleIn`.
 *
 * @property chars - Character pool the scramble draws from before
 *   resolving to the captured text. Default `'01<>/|_-+=:'` — the
 *   cinematic-HUD glyph set (digits + symbols that read as instrumentation).
 * @property duration - Scramble duration in milliseconds. Default 280ms
 *   (tight enough that state changes feel responsive, slow enough that
 *   the scramble is legible).
 * @property delay - Start delay in milliseconds before the scramble
 *   begins. Default 0ms.
 */
export type ScrambleInParams = {
  chars?: string;
  duration?: number;
  delay?: number;
};

const DEFAULT_CHARS = '01<>/|_-+=:';
const DEFAULT_DURATION_MS = 280;
const DEFAULT_DELAY_MS = 0;

/**
 * Apply a scramble-text reveal to `node` on mount.
 *
 * @param node - The element whose text should be scrambled. Its current
 *   `textContent` is captured as the final resolved value.
 * @param params - Optional tuning — see {@link ScrambleInParams}.
 * @returns Svelte action handle (`destroy` cleans up).
 */
export function scrambleIn(
  node: HTMLElement,
  params: ScrambleInParams = {}
): ActionReturn<ScrambleInParams> {
  const finalText = node.textContent ?? '';

  // ADR 0009 strict fallback: in reduced-motion mode, the captured text
  // already sits on the node (we never scrambled it). Skip GSAP entirely.
  if (prefersReducedMotion()) {
    return { destroy: () => {} };
  }

  const chars = params.chars ?? DEFAULT_CHARS;
  const durationMs = params.duration ?? DEFAULT_DURATION_MS;
  const delayMs = params.delay ?? DEFAULT_DELAY_MS;

  gsap.to(node, {
    duration: durationMs / 1000,
    delay: delayMs / 1000,
    scrambleText: {
      text: finalText,
      chars
    }
  });

  return {
    destroy: () => {
      // GSAP tweens self-clean once they complete; nothing to revert
      // on the node beyond what GSAP already does. If the component
      // unmounts mid-scramble, the dead node is GC'd and the tween
      // becomes a no-op.
    }
  };
}
