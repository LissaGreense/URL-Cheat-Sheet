/**
 * `cursorHalo` Svelte action — RAF-driven pointer-following halo
 * (spec §3.3 choreography, plan Task 10).
 *
 * Subscribes to `pointermove` on the window and writes the latest
 * pointer position into a target `(targetX, targetY)`. A
 * `requestAnimationFrame` loop lerps the rendered `(currentX, currentY)`
 * toward the target by a configurable `follow` factor each frame, then
 * writes those values to `--cx` / `--cy` custom properties on the node
 * (as percentages). The actual halo visual is a CSS radial gradient
 * defined in `atmosphere.css` against those custom properties.
 *
 * Why lerp instead of writing the raw pointer position? Direct writes
 * make the halo snap with the cursor — visually noisy and at odds with
 * the spec's ambient, drifting character. A 0.18 follow factor lags the
 * halo about a third of a second behind the pointer, which reads as
 * inertia.
 *
 * Pointer-coarse no-op:
 * On touch devices `(pointer: coarse)`, hover doesn't exist — the halo
 * would either chase a tap (jarring) or sit frozen mid-screen. The
 * action early-returns with no listeners and no RAF loop on coarse
 * pointers.
 *
 * Reduced-motion contract (ADR 0009):
 * Same as the pointer-coarse path — no listeners, no RAF, no writes.
 * The element stays at its CSS default (the halo div renders invisible
 * in `atmosphere.css` until the custom properties are populated, so a
 * reduced-motion user sees nothing — exactly per spec §3.5).
 *
 * SSR-safe: guards `typeof window === 'undefined'` so importing or
 * applying this action server-side is harmless.
 *
 * @see {@link ./_reducedMotion} for the SSR-safe media-query check.
 */
import type { ActionReturn } from 'svelte/action';
import { prefersReducedMotion } from './_reducedMotion';

/**
 * Params for `cursorHalo`.
 *
 * @property follow - Lerp factor per RAF frame, in `[0, 1]`. `1` makes
 *   the halo snap to the cursor; `0.18` (default) gives the ~⅓-second
 *   inertia spec'd for the ambient halo. Lower = lazier follow.
 */
export type CursorHaloParams = {
  follow?: number;
};

const DEFAULT_FOLLOW = 0.18;
const INITIAL_PERCENT = 50; // Start centered.

/**
 * Attach a pointer-following halo loop to `node`.
 *
 * The action is a no-op on SSR, on `(pointer: coarse)` devices, and on
 * users with `prefers-reduced-motion: reduce`.
 *
 * @param node - The element to animate. Typically the
 *   `.atmosphere__cursor-halo` div from `AtmosphereShell`.
 * @param params - Optional tuning — see {@link CursorHaloParams}.
 * @returns Svelte action handle. `destroy` tears down the pointermove
 *   listener and cancels the RAF loop so a detached node never gets a
 *   late write.
 */
export function cursorHalo(
  node: HTMLElement,
  params: CursorHaloParams = {}
): ActionReturn<CursorHaloParams> {
  // SSR guard: importing this from a +page.svelte during prerender is
  // fine; calling it during prerender shouldn't blow up either.
  if (typeof window === 'undefined') {
    return { destroy: () => {} };
  }

  // ADR 0009 strict fallback: full no-op for reduced-motion users.
  if (prefersReducedMotion()) {
    return { destroy: () => {} };
  }

  // Pointer-coarse no-op: touch devices have no hover; halo would
  // either chase taps (jarring) or sit frozen (bug-looking).
  if (window.matchMedia('(pointer: coarse)').matches) {
    return { destroy: () => {} };
  }

  const follow = params.follow ?? DEFAULT_FOLLOW;

  // Position state in viewport-percent units (0..100). Start at center
  // so the halo has a sensible resting position before the first
  // pointermove arrives.
  let targetX = INITIAL_PERCENT;
  let targetY = INITIAL_PERCENT;
  let currentX = INITIAL_PERCENT;
  let currentY = INITIAL_PERCENT;
  let rafId: number | null = null;
  let disposed = false;

  /**
   * Update the target (latest pointer) coords. The RAF loop reads
   * these; we don't write to the DOM here — that's the loop's job.
   * Schedules a new frame if one isn't already pending so the loop
   * stops itself when the pointer is idle.
   */
  function onPointerMove(event: PointerEvent): void {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    targetX = (event.clientX / w) * 100;
    targetY = (event.clientY / h) * 100;
    if (rafId === null && !disposed) {
      rafId = window.requestAnimationFrame(tick);
    }
  }

  /**
   * One RAF tick: lerp current toward target, commit to CSS vars,
   * schedule the next frame if we haven't yet settled. "Settled" means
   * the remaining delta is below a tiny epsilon — without this the
   * loop would run forever burning the GPU on subpixel updates.
   */
  function tick(): void {
    if (disposed) {
      rafId = null;
      return;
    }
    currentX += (targetX - currentX) * follow;
    currentY += (targetY - currentY) * follow;
    node.style.setProperty('--cx', `${currentX}%`);
    node.style.setProperty('--cy', `${currentY}%`);

    const dx = Math.abs(targetX - currentX);
    const dy = Math.abs(targetY - currentY);
    if (dx > 0.01 || dy > 0.01) {
      rafId = window.requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });

  return {
    destroy(): void {
      disposed = true;
      window.removeEventListener('pointermove', onPointerMove);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  };
}
