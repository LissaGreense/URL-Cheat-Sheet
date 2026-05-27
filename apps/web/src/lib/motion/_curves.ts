/**
 * @fileoverview JS-side mirrors of the easing curves defined in
 * `apps/web/src/lib/styles/tokens.css` (spec §3.1). GSAP cannot parse
 * `var(--ease-out-expo)` from a JS string, so motion actions need a
 * literal `cubic-bezier(...)` value. Mirroring the literal here — once,
 * with a deterministic test against `tokens.css` — keeps the JS and CSS
 * values from drifting silently.
 *
 * Drift guard: `_curves.test.ts` parses `tokens.css` and asserts each
 * exported constant matches the corresponding `--ease-*` value.
 */

/**
 * Mirror of `--ease-out-expo` from `tokens.css` (spec §3.1).
 *
 * Used by motion actions for the signature "snap to rest" reveal curve.
 */
export const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)' as const;
