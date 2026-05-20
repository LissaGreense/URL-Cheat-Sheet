/**
 * One-time GSAP plugin registration for the cinematic-memex HUD.
 *
 * Registers the four plugins Phase 2 motion tasks (ucs-3t6 + siblings)
 * consume:
 *
 * - `ScrollTrigger` — scroll-driven timelines.
 * - `SplitText` — line/word/char splitting for reveal animations.
 * - `ScrambleTextPlugin` — character-scramble text effects.
 * - `CustomEase` — bespoke cubic-bezier easing curves.
 *
 * GSAP's `registerPlugin` is internally idempotent (re-registering the
 * same plugin is a no-op), but we still gate on a module-scoped flag so
 * repeated `onMount` calls in dev-mode HMR don't re-execute the work.
 *
 * SSR-safe: the imports themselves are side-effect-free at the module
 * level under GSAP 3.13+. Calling `registerGsap()` from `onMount`
 * (browser-only) is the canonical entry point — never call it from the
 * top of a `+layout.svelte` `<script>` block.
 *
 * Reduced-motion: per ADR 0009, registration is NOT gated on the
 * reduced-motion media query. Registering plugins is harmless until
 * something animates; the strict fallback happens at animation time
 * inside individual motion actions (Tasks 9-13).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { CustomEase } from 'gsap/CustomEase';

let registered = false;

/**
 * Register all GSAP plugins used by the cinematic HUD. Idempotent.
 */
export function registerGsap(): void {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, CustomEase);
  registered = true;
}
