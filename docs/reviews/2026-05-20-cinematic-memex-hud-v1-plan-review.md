# v1 Plan Review Report — cinematic-memex-hud

**Reviewed:** `docs/plans/2026-05-20-cinematic-memex-hud.md` (v1, committed `005270e` on `chore/spec-cinematic-memex-hud`, with self-review touch-up `84e162f`)
**Reviewer:** improving-plans skill, single pass
**Output:** `docs/plans/2026-05-20-cinematic-memex-hud.v2.md`
**Spec under review:** `../specs/2026-05-20-cinematic-memex-hud.md`

## Method

Probed the surfaces the plan touches to test its assumptions, rather than re-reading the spec alone:

- `apps/web/src/routes/+page.svelte` — the existing 319-line monolith the plan dismantles. Confirmed: 5-state discriminated union, `Chat` instance from `@ai-sdk/svelte`, ~95-line `<style>` block at the tail, `awaitingAssistant` derivation logic, message-part rendering (text vs `tool-finalize` vs `tool-grep_doc`).
- `apps/web/src/routes/api/chat/+server.ts` — confirmed the `streamChat` boundary; validates `chatRequestSchema`, requires `ANTHROPIC_API_KEY`, returns the AI SDK UI message stream.
- `apps/web/src/routes/api/extract/+server.ts` — confirmed the `ExtractError` kind set and HTTP-status mapping. Plan's `ExtractErrorState` props match the surface.
- `packages/agent/src/agent.ts` and `packages/agent/src/tools/finalize.ts` — confirmed `finalize` is a **client-side sentinel tool**: its `input.answer` *is* the rendered answer, there is no `output`. Confirmed `stopWhen: [stepCountIs(10), hasToolCall('finalize')]`.
- `packages/schemas/dist/extract.d.ts` — confirmed `Document = { text, title, sourceUrl }` and `ExtractResponse` shape.
- `apps/web/tests/chat-route.test.ts` and `extract-route.test.ts` — confirmed the existing test patterns (Vitest, `vi.mock` upstream, no `@testing-library/svelte` usage *yet* despite the dep being installed).
- `docs/plans/2026-05-19-url-fetcher.v2.md` and prior review reports — calibrated the project's plan-iteration conventions (`.vN.md` suffix, "Changes from v1" header section, `Items not raised` discipline).

## Findings

### 1. `MessageStream` props lose Svelte 5 reactivity (applied to v2)

v1 Task 5 specified:
```ts
type Props = { messages: ReadonlyArray<UIMessage>; awaitingAssistant: boolean; };
```
and called the component as `<MessageStream messages={chat.messages} ...>`.

`Chat` from `@ai-sdk/svelte@^4` exposes `chat.messages` as an internally-reactive Svelte 5 state array. Destructuring it at the prop boundary reads the value once at render time. SSE-driven mutations to `chat.messages` (each incoming token, each new tool-call part) would not propagate to the rendered thread — the chat would appear frozen mid-stream.

The existing monolithic `+page.svelte` reads `chat.messages` directly inside the same reactive scope where `chat` is constructed, which is why it works today. The decomposition needs to preserve this property.

**v2 change:** `MessageStream` takes `chat: Chat` and reads `chat.messages` internally. Cascading update at the `ReadyState` call site.

This is the highest-severity issue caught — without the fix, Phase 1 ships a non-functional chat thread.

### 2. GSAP-in-jsdom test strategy is undefined (NOT applied per user direction)

v1's Phase 2 tasks (9, 10, 11) prescribe Vitest unit tests for each motion action (`scrambleIn`, `splitLineReveal`, `phosphorFlash`, `idleBreath`, `cursorHalo`, `scanSweep`, `assembleCascade`). But Vitest's jsdom environment runs no `requestAnimationFrame` loop and no CSS animation — GSAP's actual visual effect is unobservable. Each implementing agent will re-decide what "testing motion actions" means and likely produce inconsistent test patterns (some mocking `gsap`, some skipping, some hand-rolling fake timers).

**Two options offered:**
- (A) Add a `vi.mock('gsap')` setup file globally. Tests assert each action *called* `gsap.to` / `gsap.from` / `gsap.timeline` with the right config — testing the wiring contract, not the pixels.
- (B) Skip motion-action unit tests entirely; cover via `qa-standard` in Task 14.

**User direction:** dropped. Phase 2 tests will be decided ad-hoc per task. Risk: some motion actions will land without contract tests; regressions in (say) the scramble char set or compile-bar ratio computation may not show in CI.

### 3. Mid-stream error UX is missing (NOT applied per user direction)

`streamChat` can fail mid-response: Anthropic 5xx, network drop, browser navigation abort, or the model exhausting `stepCountIs(10)` without ever calling `finalize`. The current minimal UI silently shows whatever partial assistant text arrived.

Spec §5.3 covers `[ FAULTED ]` and `[ HALTED ]` *for tool calls* but does not cover the case where the assistant message itself never reaches `finalize`. With the new always-alive cinematic posture (compile-bar growing, status pill rotating, scanline sweeping), a stuck mid-stream state is *more* visually jarring than the current minimal UI. Empty / orphaned scan cards stay forever.

**Two options offered:**
- (A) New `[ STREAM_INTERRUPTED ]` status. When `chat.status === 'error'` or transitions `'streaming' → 'idle'` without an observed `tool-finalize` part, the in-flight assistant message and any active scan cards flip to this status, dim, and stop animating. Plan adds this to Task 5 (chrome) + Task 11 (motion).
- (B) Defer to QA — file as a defect against the new UI rather than designing it in.

**User direction:** dropped (option B implicitly). QA will catch it; the team owns the fix at that point.

### 4. `finalize` is a client-side sentinel — explanation missing (NOT applied per user direction)

The `finalize` tool in `packages/agent/src/tools/finalize.ts` is unusual: its `input.answer` *is* the rendered answer. It has no `execute` and no `output`. AI SDK's standard convention is to render `part.output` for tool calls — an implementing agent reading the plan cold will likely write `part.output?.answer`, find it undefined at runtime, and start debugging.

v1's `FinalizeScan` interface reads `part.input?.answer` (correct) but doesn't explain why. v2 was going to add a one-paragraph note.

**User direction:** dropped. Impl agent will discover this from reading `packages/agent/src/tools/finalize.ts` if they hit confusion. The risk is wasted debugging time on a counter-intuitive surface.

### 5. Legacy `<style>` block deletion missing from Task 5 (applied to v2)

v1 Task 5 dismantles the existing 319-line `+page.svelte` by moving its visual markup into State and chat components. But the tail `<style>` block (~95 lines: `.container`, `.composer`, `.message`, `.flagged`, `.chip`, `.role`, etc.) is never explicitly deleted.

If left behind, those scoped styles still apply to anything that still uses those class names *inside `+page.svelte` itself*. In practice that's nothing after the migration — but the leftover styles also create future drift: a future agent adding a `class="composer"` element in `+page.svelte` would silently inherit legacy styling.

Easy thing to forget mid-migration. Easy to fix by spelling it out.

**v2 change:** Task 5 gains an explicit Step 8 — "Delete the legacy `<style>` block from `+page.svelte`. Verify with `grep -n '<style' apps/web/src/routes/+page.svelte` returning no matches." Steps 8/9 renumbered to 9/10.

## Items not raised

- **Tool-name path strings.** `'tool-finalize'` and `'tool-grep_doc'` in v1 — confirmed correct against `packages/agent/src/agent.ts`. AI SDK v6 emits parts as `tool-${toolName}` where `toolName` is the key in the `tools` object literal. Both names match.
- **`Chat.messages` mutation API.** v1's existing `+page.svelte` does `chat.messages = []` in `reset()`. Confirmed this is a supported pattern in `@ai-sdk/svelte` v4 (the array is reactive but reassignable). v1's plan preserves the existing `reset` function, so no change needed.
- **Vitest+`@testing-library/svelte` integration.** Both deps are installed (`apps/web/package.json` lines 27–28). Confirmed via dep list. The existing tests don't use `@testing-library/svelte` yet (only the API-route tests exist), so the component tests v1 prescribes will be the first consumer — minor setup risk but not a plan-level issue.
- **Vite 8 `rolldownOptions` config.** Plan doesn't touch the Vite config. Not a concern for this redesign.
- **`prefers-reduced-motion` ADR timing.** v1's Task 7 is the decision gate at start of Phase 2. Phase 1 ships without any motion, so the decision doesn't actually block until Task 8. Wording could be tighter ("decision needed before Task 8, not before Phase 2") but the practical effect is identical.
- **`@fontsource/manrope` + `@fontsource/space-grotesk` versions.** v1's self-review pass already moved these into the explicit Phase 1 additions list and added an `npm view` step. Verified that fontsource packages exist on npm (they're widely used and current).
- **Protrakt licensing.** Spec §2.2 names `Protrakt` as the display face but provides `Space Grotesk` as a fallback. v1 ships only the fallback in package.json. Protrakt licensing is a procurement question deferred to the user — correctly framed.

## Unresolved questions

- **Will `MessageStream` actually re-render on incoming SSE tokens after the v2 reactivity fix?** Plausibly yes — same pattern as the existing monolithic page — but only Phase 1 Task 5's manual visual check will prove it. If it doesn't, fallback is moving to a `setContext(chat)` model.
- **Will the cinematic compile-bar growth animation cause perceptible jank on streaming chat?** Each token arrival triggers an `assembleCascade` update which writes to a GSAP timeline. At 30 tokens/sec this is 30 GSAP updates per second. GSAP is built to handle this but combined with the 5-layer ambient stack it's worth a perf check at Phase 2 Task 12 (already in the plan).
- **What is the actual perf cost of `feTurbulence` + `feDisplacementMap` at 1440px on mid-tier hardware?** Plan's mobile fallback (baked PNG) assumes desktop can handle the live filter. The performance check in Task 12 Step 5 is the validation. If it fails the budget, the fallback list extends to desktop too.
- **Will the `scramble-text` effect on streaming `finalize` look right when the text is *already* streaming token-by-token?** Two competing animations on the same surface: the SSE stream appending characters, AND scramble-in scrambling them. Spec §5.2 says scramble-in fires "per line" — needs careful coordination with line-boundary detection. Worth a Phase 2 design pass that the plan currently leaves implicit.
