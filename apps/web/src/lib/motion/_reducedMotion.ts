/**
 * Reduced-motion preflight helper.
 *
 * Per ADR 0009, motion is fully disabled when the user has
 * `prefers-reduced-motion: reduce` set. Callers should consult this
 * before instantiating animation runtimes (e.g. Lenis) or kicking off
 * any GSAP animation. Plugin registration itself is a no-op until an
 * animation runs, so it does NOT need to be gated.
 *
 * SSR-safe: returns `false` when `window` is undefined, so server
 * renders never attempt to read `matchMedia`.
 *
 * @returns `true` when the user prefers reduced motion, `false` otherwise.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
