/**
 * `scrambleIn` Svelte action — the cinematic memex HUD's text-scramble
 * primitive (spec §3.3 choreography, plan Task 9).
 *
 * On mount, the action writes the supplied `text` to the element and asks
 * GSAP's `ScrambleTextPlugin` to "resolve" it by scrambling through random
 * characters before settling on the target value. Used by the status pill
 * so transitions like `[ STANDBY ]` → `[ READY ]` read as instrumented
 * terminal output, not a plain swap.
 *
 * Managed-content contract (ucs-eem fix):
 * The action OWNS `node`'s text content. Callers must pass the target
 * string via `params.text` and must NOT interpolate Svelte children into
 * `node` — i.e. `<span use:scrambleIn={{ text: state }}></span>`, never
 * `<span use:scrambleIn>{state}</span>`. The reason: GSAP's
 * `ScrambleTextPlugin` mutates `node.textContent` mid-animation, which
 * detaches any text node Svelte was tracking for reactivity. If Svelte
 * tries to update an orphaned text node, the visible DOM freezes at
 * mount-time text even after the underlying state advances. Owning the
 * content end-to-end keeps Svelte and GSAP from fighting over the same
 * text node.
 *
 * On every `update` call, the action diffs `params.text` against the
 * previous value and re-fires the scramble when it changes — so reactive
 * state transitions (`SCANNING` → `3 HITS`) animate end-to-end.
 *
 * Reduced-motion contract (ADR 0009):
 * When `prefers-reduced-motion: reduce` is set, the action writes the
 * text to the node synchronously (initial mount AND every update) and
 * skips GSAP entirely. No animation runtime touches the DOM in reduced
 * mode, and reactive updates still propagate.
 *
 * GSAP unit conversion: GSAP's `duration` and `delay` accept SECONDS,
 * not milliseconds. The action's params are in ms (matching the design
 * tokens in `tokens.css`) and convert at the boundary.
 *
 * Plugin registration is the layout's responsibility (`registerGsap()`
 * runs once on mount in `+layout.svelte`); this action assumes
 * `ScrambleTextPlugin` is already live in production. In jsdom unit
 * tests the plugin is unregistered (gsap.to is mocked); the action's
 * own textContent-write keeps the test contract honest without it.
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
 * @property text - The text to scramble in. The action writes this value
 *   to `node.textContent` on mount and replays the scramble whenever it
 *   changes via `update`. Callers MUST NOT interpolate Svelte children
 *   into `node` — the action owns the content. See module docstring.
 * @property chars - Character pool the scramble draws from before
 *   resolving to the target text. Default `'01<>/|_-+=:'` — the
 *   cinematic-HUD glyph set (digits + symbols that read as instrumentation).
 * @property duration - Scramble duration in milliseconds. Default 280ms
 *   (tight enough that state changes feel responsive, slow enough that
 *   the scramble is legible).
 * @property delay - Start delay in milliseconds before the scramble
 *   begins. Default 0ms.
 */
export type ScrambleInParams = {
  text: string;
  chars?: string;
  duration?: number;
  delay?: number;
};

const DEFAULT_CHARS = '01<>/|_-+=:';
const DEFAULT_DURATION_MS = 280;
const DEFAULT_DELAY_MS = 0;

/**
 * Apply a scramble-text reveal to `node` on mount, and re-fire whenever
 * `params.text` changes.
 *
 * @param node - The element whose text the action manages.
 * @param params - Target text + optional tuning — see {@link ScrambleInParams}.
 * @returns Svelte action handle. `update` re-fires the scramble on text
 *   change; `destroy` is a no-op (GSAP self-cleans on completion or when
 *   the node is GC'd).
 */
export function scrambleIn(
  node: HTMLElement,
  params: ScrambleInParams
): ActionReturn<ScrambleInParams> {
  // The action owns node's content. Write the target text up front so
  // the resting visual is correct even before GSAP runs (matters for
  // jsdom unit tests where gsap.to is mocked, and for the first frame
  // before the scramble starts in real browsers).
  node.textContent = params.text;

  let lastText = params.text;

  // ADR 0009 strict fallback: in reduced-motion mode, the captured text
  // already sits on the node. Skip GSAP entirely but keep the update
  // hook live so reactive text changes still propagate.
  if (prefersReducedMotion()) {
    return {
      update(next: ScrambleInParams): void {
        if (next.text === lastText) return;
        lastText = next.text;
        node.textContent = next.text;
      },
      destroy: () => {}
    };
  }

  /**
   * Fire one scramble tween toward the target text. Used on mount and
   * on every subsequent `update` where `text` changed.
   *
   * `overwrite: 'auto'` (ucs-6j9 regression guard): when a state
   * transition arrives during an in-flight scramble (rapid SSE chunks
   * mid-turn — e.g. a flurry of grep_doc calls finishing within the
   * 280ms tween window), the in-flight tween would otherwise finish
   * AFTER the newer one and write its now-stale resolved text to
   * `node.textContent`, freezing the pill at the previous state. With
   * `overwrite: 'auto'`, GSAP kills any conflicting tween on the same
   * target before scheduling the new one. The killed tween's final
   * write never lands, and the only tween still alive resolves to the
   * latest `text`.
   */
  function fire(text: string, durationMs: number, delayMs: number, chars: string): void {
    gsap.to(node, {
      duration: durationMs / 1000,
      delay: delayMs / 1000,
      overwrite: 'auto',
      scrambleText: {
        text,
        chars
      }
    });
  }

  fire(
    params.text,
    params.duration ?? DEFAULT_DURATION_MS,
    params.delay ?? DEFAULT_DELAY_MS,
    params.chars ?? DEFAULT_CHARS
  );

  return {
    update(next: ScrambleInParams): void {
      if (next.text === lastText) return;
      lastText = next.text;
      fire(
        next.text,
        next.duration ?? DEFAULT_DURATION_MS,
        next.delay ?? DEFAULT_DELAY_MS,
        next.chars ?? DEFAULT_CHARS
      );
    },
    destroy: () => {
      // GSAP tweens self-clean once they complete; nothing to revert
      // on the node beyond what GSAP already does. If the component
      // unmounts mid-scramble, the dead node is GC'd and the tween
      // becomes a no-op.
    }
  };
}
