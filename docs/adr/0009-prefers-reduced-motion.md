# ADR 0009: `prefers-reduced-motion` strategy for cinematic memex HUD

**Status:** accepted
**Date:** 2026-05-20

## Context

The cinematic memex HUD redesign (`docs/specs/2026-05-20-cinematic-memex-hud.md`,
plan `docs/plans/2026-05-20-cinematic-memex-hud.v2.md`) is a "heavier-cinematic,
always-alive HUD" — Phase 2 adds GSAP-driven choreography on top of a
5-layer ambient atmosphere stack that runs continuously: a turbulence
backdrop (60–90s drift), 2–3 glow pads (12–20s drifts), ~12 spec dots
(8–20s loops, randomized phases), a cursor halo (continuous,
pointer-driven), plus per-state showpiece moments (split-line reveals,
scramble-text, the extracting → ready cinematic transition, the per-tool
scan animations).

This is well above the motion budget that's safe for users with
vestibular sensitivity, ADHD, or visual processing disorders. OS-level
`prefers-reduced-motion: reduce` is the standard signal these users send
to the platform — set by ~5–15% of users globally per Mozilla
Observatory + Apple HIG research. Honoring it is industry table-stakes
for modern web; ignoring it is a documented a11y regression.

The spec deferred this decision (§3.5, §7) because the brainstorm
already established a "heavier-cinematic" direction that pulls against
strict accessibility. Three options were tabled:

1. **Strict fallback** — honor the OS setting. Ambient drift + glyph
   rain disabled; showpieces collapse to instant state changes or
   simple fades. Theme/colors stay cinematic; only motion drops out.
2. **Soft fallback** — honor the setting but keep one signature moment
   (the memory-load transition) as a slower, gentler version so the
   identity survives. Ambient effects off, showpieces simplified but
   not eliminated.
3. **No fallback** — cinematic for everyone, OS setting ignored.
   Strongest brand consistency, ships an a11y regression.

The reference vocabulary the design draws from ships **no** reduced-motion
fallback. The decision here is deliberately not to inherit that posture.

## Decision

**Strict fallback.** Every Phase 2 motion action and every
`@keyframes`-driven ambient loop MUST consult `prefers-reduced-motion`
at module-evaluation time (via `window.matchMedia('(prefers-reduced-motion: reduce)').matches`)
and:

- For ambient motion (turbulence backdrop drift, glow-pad drift, spec-dot
  float, cursor halo lerp): disable entirely. Atmosphere layers stay
  rendered at their resting visual state.
- For showpiece moments (`splitLineReveal`, `scrambleIn`,
  `phosphorFlash`, `idleBreath`, `cursorHalo`, `scanSweep`,
  `assembleCascade`, the cinematic `extracting → ready` transition):
  collapse to an instant state change or a simple opacity fade.
- For the `ExtractingState` indeterminate progress bar (shipped in
  Phase 1 Task 3 under the lone CSS `@keyframes` carve-out): bar stays
  rendered at full extent (the visual contract is "we're loading", not
  "X% done" — no value is lost by removing the pulsing).

Theme, palette, typography, atmosphere layer rendering, instrumentation
vocabulary (`// LABEL_NAME`, `> action`, `[ STATE ]`, corner stamps),
and HUD chrome (`HudPanel`, `StatusPill`, scan cards) are unaffected.
**Only motion drops out.**

Implementation seam: every Svelte action created in Phase 2 Tasks 9–11
(`apps/web/src/lib/motion/`) exposes a single internal helper —
something like `prefersReducedMotion(): boolean` — read at action mount.
When `true`, the action sets the final state synchronously (text
resolved, classes applied, position at endpoint) and returns a no-op
`destroy`. The `@keyframes` rules in `atmosphere.css` are wrapped in
`@media (prefers-reduced-motion: no-preference) { ... }` so the rules
themselves don't fire in reduced mode. SSR-rendered HTML and initial
client-rendered HTML are visually identical regardless of reduced-motion
preference (no flash-of-motion).

## Consequences

- **Positive (a11y):** Standard modern-web posture. Vestibular and
  visual-processing sensitivities are respected without per-user
  configuration UI. Lighthouse + axe-core a11y audits cleaner.
- **Positive (perf):** Reduced-motion users skip the GSAP `ticker`
  RAF loop, the cursor `pointermove` listener, and ~16 simultaneous
  CSS animations. Mobile devices on low-end Android Chrome (where
  motion budget is tightest anyway) benefit.
- **Positive (implementation discipline):** A single contract enforced
  at module-evaluation time across every motion action prevents the
  trickle-down complexity of per-action policy decisions. The reviewer
  has one thing to check, not eight.
- **Negative (brand):** ~5–15% of users see a substantially simpler UI.
  The "always-alive HUD" identity is partially lost for them — only
  the static instrumentation vocabulary + palette discipline carries
  the brand. The reference site doesn't have this trade-off because
  it doesn't honor reduced-motion at all; we deliberately accept the
  trade to ship a publicly defensible a11y posture.
- **Negative (storyboarding):** Phase 2 Task 13's cinematic
  `extracting → ready` transition must work in reduced-motion mode
  as an instant state swap with no transition art. The impl agent
  needs to confirm this looks acceptable (it should — the chat
  surface just appears).

## Alternatives considered

- **Soft fallback (option 2).** Keeping one signature moment for
  reduced-motion users was tempting — it would preserve the brand
  identity moment that's most memorable (memory-load). Rejected because
  (a) "one moment" is the camel's nose under the tent for re-litigating
  every other moment; (b) users who set reduced-motion are signaling
  "this motion category causes me a problem", not "preserve one
  moment"; (c) implementation simplicity — a binary contract is easier
  to enforce than a per-element exception list.
- **No fallback (option 3).** Considered briefly because the reference
  site ships no fallback and we admire its visual cohesion. Rejected
  because URL-Cheat-Sheet is a personal knowledge instrument the user
  may eventually want to share, demo, or open up — at any of those
  points, an a11y regression becomes a public-facing posture rather
  than a private one. The cost of *adding* a fallback later (auditing
  every motion action retroactively) is higher than the cost of
  enforcing it from the start.

## References

- `docs/specs/2026-05-20-cinematic-memex-hud.md` §3.5 (deferred
  decision this ADR resolves) and §7 (deferred-decisions register).
- `docs/plans/2026-05-20-cinematic-memex-hud.v2.md` — Task 7 (this
  ADR), Tasks 9–13 (motion implementations that consume this
  decision).
- [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
  — platform behavior + media-query usage.
- WCAG 2.1 SC 2.3.3 (Animation from Interactions) — the underlying
  guideline.
