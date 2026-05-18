# Review: feat/ucs-s0x-implement-chat-ui-on-page-svelte

**Date:** 2026-05-18
**Branch:** feat/ucs-s0x-implement-chat-ui-on-page-svelte
**PR:** https://github.com/LissaGreense/URL-Cheat-Sheet/pull/12
**bd issue:** ucs-s0x (T5 of `docs/plans/2026-05-18-rfc2324-chat-mvp.md`)
**Verdict:** Clean

## Summary

This PR replaces the placeholder `+page.svelte` with an `@ai-sdk/svelte` v4
`Chat`-based UI that POSTs to `/api/chat`. The implementation matches all
acceptance criteria. The single planned deviation (using
`new Chat({ transport: new DefaultChatTransport({ api: ... }) })` instead of
the plan's `new Chat({ api: ... })` shorthand) is the correct AI SDK v6
idiom — `ChatInit` no longer exposes an `api` field, only `transport`
(verified in `node_modules/.bun/ai@6.0.184/.../ai/dist/index.d.ts` line 3800).
`DefaultChatTransport` ships from the `ai` core (line 4051). Behavior is
equivalent.

## Critical

None.

## Important

None. The implementation is small, readable, and adheres to plan + AC.

## Tests

No test files in this diff. Per spec § Testing, no automated UI tests are
required for v1; the manual smoke test is the `gate:qa` deliverable. The
plan's earlier tasks (T1–T4) carry the automated coverage for the agent
and the route. Acceptable.

## Verification of AC

- [x] Single `Chat` instance mounted, routed to `/api/chat` via
      `DefaultChatTransport` (v6 idiom — equivalent to the plan's
      now-removed `api` shorthand).
- [x] Message list keyed on `message.id`; role label per message; one
      element per part. `text` → `<p class="text">` with
      `white-space: pre-wrap`; `tool-*` → collapsed `<details>` with the
      part JSON inside `<pre>`.
- [x] `<details>` has no `open` attribute — collapsed by default.
- [x] Composer is a controlled `<form>` with `<input bind:value={input}>`
      and a submit `<button>`.
- [x] Input disabled while `chat.status === 'streaming' || 'submitted'`.
- [x] Submit handler trims input, early-returns on empty, calls
      `chat.sendMessage({ text })`, clears the input.
- [x] Plain-text rendering of text parts (no markdown renderer, no
      `@html`).
- [x] No persistence: no `localStorage`, `sessionStorage`, `indexedDB`,
      or cookie wiring. Reloading wipes state by default.
- [x] `bun run --filter @url-cheat-sheet/web check` errors are the two
      pre-existing `.ts` extension warnings on `tests/chat-route.test.ts`
      and `tests/health.test.ts` — none introduced by this PR.

## Needs Decision

1. **Asymmetric button disable.** The input disables on both `'streaming'`
   and `'submitted'`; the button only disables on `'streaming'` (plus
   `!input.trim()`). The AC says *both* controls should disable on
   `'submitted'` as well. In practice the asymmetry is harmless: when
   `status === 'submitted'`, the input is disabled, so `input` stays
   whatever the user just sent (cleared by `onSubmit`) → `!input.trim()`
   is true → button is disabled anyway. The plan source (Task 5 Step 1)
   has the same asymmetry, so this matches the plan as written.

   Worth doing: **No** — strict reading of AC is satisfied transitively
   via the empty-input guard; fixing would be a one-token change but
   adds zero observable behavior. If you want strict literal AC
   compliance, change the button to
   `disabled={!input.trim() || chat.status === 'streaming' || chat.status === 'submitted'}`.
   Defer unless QA flags it.

2. **`part.type?.startsWith('tool-')` uses optional chaining on a
   required field.** `UIMessagePart.type` is a non-optional string union
   in AI SDK v6. The `?.` is dead defensiveness. Harmless and matches
   the plan verbatim.

   Worth doing: **No** — speculative cleanup, pre-existing in plan.
