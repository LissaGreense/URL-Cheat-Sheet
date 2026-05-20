/**
 * `scanSweep` Svelte action — the cinematic memex HUD's tool-call
 * scanline primitive (spec §5.1, plan Task 11).
 *
 * On mount and on every `trigger`-value change, the action animates a
 * child `.scan-sweep__line` element down the host via a GSAP timeline:
 *
 *   - `set(top: '0%', opacity: 0)` — seed from the top, invisible.
 *   - `to(top: '100%', ease: --ease-out-expo)` — descend the full height.
 *   - parallel `to(keyframes: [opacity: 0.9, opacity: 0.4])` — start at
 *     the descent's position 0 (via GSAP's `<` operator) so the line's
 *     brightness peaks mid-traversal then settles to the final glow.
 *
 * The descent tween uses `--ease-out-expo` (cubic-bezier(0.16, 1, 0.3, 1))
 * so the line accelerates fast then settles, matching the rest of the
 * cinematic motion vocabulary.
 *
 * Reduced-motion contract (ADR 0009):
 * When `prefers-reduced-motion: reduce` is set, the action is a pure
 * no-op — no GSAP scheduling, no listeners, no timers. The scanline's
 * inline `opacity` is pinned to `'0'` so even if the CSS resting state
 * leaves it visible, reduced-motion users never see a stale line.
 *
 * Trigger semantics:
 * `trigger: unknown` — any value works. The action kills the active
 * timeline and re-fires when the value !== the previous one (strict
 * equality). Pass a stable scalar (e.g. the parent `state` prop) — a
 * fresh object reference per render WILL re-fire each time.
 *
 * **Mount suppression:** if `trigger` is `null` or `undefined` on
 * mount, no sweep fires. This lets callers gate the initial sweep on
 * "is this card in an actively-scanning state" without resorting to
 * conditional `use:` directives. The action still tracks the value,
 * so when it later transitions to a non-nullish value the sweep fires
 * on that change.
 *
 * Defensive on missing child:
 * If `.scan-sweep__line` is not found on the host, the action no-ops
 * gracefully. This keeps a future template refactor from crashing the
 * UI; the action's contract is "drive the scanline if one exists",
 * not "demand a scanline".
 *
 * GSAP unit conversion: GSAP's `duration` accepts SECONDS. Action
 * params are in milliseconds and convert at the boundary.
 *
 * @see {@link ./_reducedMotion} for the SSR-safe media-query check.
 * @see {@link ./registerGsap} for one-time plugin registration.
 */
import { gsap } from 'gsap';
import type { ActionReturn } from 'svelte/action';
import { prefersReducedMotion } from './_reducedMotion';

/**
 * Params for `scanSweep`.
 *
 * @property trigger - Any value; the sweep re-fires whenever this value
 *   changes (strict-equality comparison). Pass a stable scalar — e.g.
 *   the parent component's `state` prop — not a fresh object literal
 *   per render.
 * @property duration - Total descent duration in milliseconds. Default
 *   600ms. The opacity tween runs in parallel over the same span so
 *   the line's brightness peaks (0.9) mid-traversal and settles at
 *   0.4 as it reaches the bottom.
 */
export type ScanSweepParams = {
  trigger: unknown;
  duration?: number;
};

/**
 * Child selector the action targets inside the host element. Exported
 * so consuming components (and tests) can reference the canonical
 * literal rather than re-typing the string.
 */
export const SCAN_SWEEP_LINE_SELECTOR = '.scan-sweep__line';

const DEFAULT_DURATION_MS = 600;

// Spec §3.1 — `--ease-out-expo` mirrored verbatim from tokens.css so
// JS-driven tweens match CSS-driven ones (GSAP can't read CSS var()s
// from a string literal — it needs a parseable ease).
const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Apply a scanline sweep to `node` on mount and on every `trigger`
 * change.
 *
 * @param node - The host element. The action looks up a
 *   `.scan-sweep__line` descendant via `querySelector`.
 * @param params - Trigger value plus optional tuning — see
 *   {@link ScanSweepParams}.
 * @returns Svelte action handle. `update` kills the active timeline
 *   and re-fires when `trigger` changes; `destroy` kills the active
 *   timeline so a stale tween cannot touch a detached node.
 */
export function scanSweep(
  node: HTMLElement,
  params: ScanSweepParams
): ActionReturn<ScanSweepParams> {
  const scanline = node.querySelector<HTMLElement>(SCAN_SWEEP_LINE_SELECTOR);

  // Defensive: no scanline → no animation. We still return a valid
  // action handle so Svelte doesn't error on the missing return.
  if (scanline === null) {
    return {
      destroy: () => {},
      update: () => {}
    };
  }

  // ADR 0009 strict fallback: no GSAP, no timers, no listeners. Pin
  // the scanline to opacity 0 so its resting visual is invisible.
  if (prefersReducedMotion()) {
    scanline.style.opacity = '0';
    return {
      destroy: () => {},
      update: () => {}
    };
  }

  let lastTrigger = params.trigger;
  let activeTimeline: ReturnType<typeof gsap.timeline> | null = null;

  /**
   * Build + play a fresh sweep timeline. Kills any in-flight timeline
   * first so back-to-back triggers don't stack overlapping tweens.
   *
   * Structure:
   *   - `set` seeds the scanline at the top, invisible.
   *   - A single `to` drives the descent (`top: 0% → 100%`) over the
   *     full `duration` using `--ease-out-expo`.
   *   - A parallel `to` (started at position `0` via the `<` operator)
   *     drives the opacity using GSAP's `keyframes` syntax so the curve
   *     passes through 0 → 0.9 (mid) → 0.4 (end) within the same span.
   *     Running it in parallel keeps the descent's duration intact —
   *     the spec calls for "600ms ease-out-expo" on the sweep itself.
   */
  function fire(durationMs: number): void {
    if (activeTimeline !== null) {
      activeTimeline.kill();
      activeTimeline = null;
    }
    const totalSec = durationMs / 1000;

    activeTimeline = gsap
      .timeline()
      .set(scanline, { top: '0%', opacity: 0 })
      .to(scanline, {
        top: '100%',
        duration: totalSec,
        ease: EASE_OUT_EXPO
      })
      .to(
        scanline,
        {
          keyframes: [
            { opacity: 0.9, ease: 'none' },
            { opacity: 0.4, ease: 'none' }
          ],
          duration: totalSec
        },
        '<'
      );
  }

  // Mount-fire suppression: if the trigger is nullish at mount, skip
  // the initial sweep. The action still tracks the value, so a later
  // transition to a non-nullish trigger fires the sweep at that point.
  if (params.trigger !== null && params.trigger !== undefined) {
    fire(params.duration ?? DEFAULT_DURATION_MS);
  }

  return {
    update(next: ScanSweepParams): void {
      if (next.trigger === lastTrigger) return;
      lastTrigger = next.trigger;
      // Same nullish gate on update — transitioning back to null/undefined
      // shouldn't re-fire the sweep (e.g. state goes scanning → halted
      // and the host nulls the trigger to "stop").
      if (next.trigger === null || next.trigger === undefined) return;
      fire(next.duration ?? DEFAULT_DURATION_MS);
    },
    destroy(): void {
      if (activeTimeline !== null) {
        activeTimeline.kill();
        activeTimeline = null;
      }
    }
  };
}
