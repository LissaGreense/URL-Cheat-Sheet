# Review: feat/ucs-23r-implement-streamchat-agent-with-system-prompt

**Date:** 2026-05-18
**Branch:** `feat/ucs-23r-implement-streamchat-agent-with-system-prompt`
**PR:** [#10](https://github.com/LissaGreense/URL-Cheat-Sheet/pull/10)
**bd issue:** `ucs-23r` (T3 of `docs/plans/2026-05-18-rfc2324-chat-mvp.md`)
**Verdict:** Clean — pass

## Summary

Adds the `streamChat` agent that wires Anthropic Sonnet 4.6 to the
`grep_rfc` tool with a citation-requiring system prompt. Placeholder
agent and its test are deleted. Four new unit tests cover SYSTEM_PROMPT
content (`grep_rfc`, `RFC 2324`, "line number", "no markdown"), tool
export shape, and `streamChat` callability. Tests: 13/13 green; build
clean.

## Acceptance criteria

All AC met:

- [x] `packages/agent/src/prompt.ts` exports `SYSTEM_PROMPT` containing
  `grep_rfc`, `RFC 2324`, "line number" (as "line number(s)"), and
  "no markdown". Verified with grep on the source.
- [x] `packages/agent/src/agent.ts` exports `streamChat(messages:
  UIMessage[])` calling `streamText({ model:
  anthropic('claude-sonnet-4-6'), system: SYSTEM_PROMPT, messages: await
  convertToModelMessages(messages), tools: { grep_rfc: grepRfc },
  stopWhen: stepCountIs(5) })`. See §"Plan deviation" below — the
  function is `async` and returns `Promise<Response>` rather than the
  raw `streamText` result; this is documented inline and accepted.
- [x] `packages/agent/src/index.ts` re-exports `streamChat`,
  `SYSTEM_PROMPT`, `grepRfc`, `grepLines`, and the `GrepMatch` type;
  extensionless imports (consistent with the rest of `src/`).
- [x] `packages/agent/src/placeholder-agent.ts` and
  `packages/agent/tests/placeholder-agent.test.ts` deleted (confirmed
  via `ls packages/agent/{src,tests}/`).
- [x] `packages/agent/tests/agent.test.ts` exists with the 4 tests from
  the plan. The 4th test message was tightened from "has a pattern
  input" to "has an inputSchema" to match what's asserted — fine.
- [x] `bun run --filter @url-cheat-sheet/agent test` reports 13/13
  green (3 files); `build` exits 0.

## Plan deviation: `streamChat` returns `Promise<Response>`

The plan specified `streamChat(messages: UIMessage[])` returning the
raw `streamText(...)` result (a `StreamTextResult<...>`). The impl
instead `await`s `convertToModelMessages`, calls `streamText(...)`,
then returns `result.toUIMessageStreamResponse()` — yielding
`Promise<Response>`.

**Stated reason** (PR + impl JSDoc): AI SDK's internal `Output` type
parameter on `StreamTextResult` can't be named in TypeScript
declaration emit, so exporting a `streamText` result from a `composite`
package would either require an explicit annotation that pulls private
SDK types into the public surface, or break `tsc -b`.

**Worth doing:** Yes for the deviation — keep it. `toUIMessageStreamResponse()`
is the only consumer per the plan (Task 4 endpoint calls
`result.toUIMessageStreamResponse()` directly); moving it inside
`streamChat` is a one-line change in the endpoint
(`return await streamChat(parsed.data.messages as UIMessage[]);`).
That's strictly less code at the route boundary and avoids the
declaration-emit issue cleanly. Task 4 will adapt trivially.

**Verified the async-await is correct:** in AI SDK v6,
`convertToModelMessages` is declared `Promise<ModelMessage[]>` (see
`node_modules/.bun/ai@6.0.184/.../ai/dist/index.d.ts:3941`), so the
`await` is required — calling it sync would pass a Promise into
`streamText.messages`. The deviation actually fixes a latent bug the
plan's literal code would have had.

**Note for Task 4 author:** The plan's draft endpoint reads
`const result = streamChat(...); return result.toUIMessageStreamResponse();`.
With the new signature, change to
`return await streamChat(parsed.data.messages as UIMessage[]);`.
This is the only downstream ripple.

## Critical

None.

## Important

None. The streamChat return shape is the only deviation and is well-reasoned.

## Tests

Solid for the scope the plan defined.

- 4/4 new tests pass; existing 9 (grep-rfc, bundled-rfc) still pass.
- Per the plan's explicit decision ("No live-LLM tests… we test the
  surface; the route test mocks at the `streamChat` boundary instead"),
  there's no integration test that actually invokes `streamChat`. The
  route test in Task 4 will exercise the boundary; acceptable.
- Test imports use explicit `.ts` extensions, which the plan's snippet
  also did. Bundler resolution + Vitest handle this fine. Not a
  blocker, but `index.ts` and `agent.ts` use extensionless imports —
  worth standardising in a future cleanup pass, not in this PR.

## Hard-rule check (CLAUDE.md)

- Zod: only `z.strictObject` in the package; no `.strict()`. (Single
  occurrence in `tools/grep-rfc.ts` from a prior PR — already correct.)
- No `bun.lockb` introduced.
- No `rollupOptions` / no `--no-daemon`.
- TS strict + `verbatimModuleSyntax` honored.
- Branch is feature branch, not `main`.

## Non-blocking observations

1. `agent.ts` JSDoc mentions "the route handler converts to a 500" —
   accurate per Task 4's plan, but the route handler doesn't exist
   yet. Could read as forward reference; harmless.
2. The `as UIMessage[]` cast called for at the route boundary lives
   one task away; not this PR's concern.
3. `streamChat` could in principle take an `AbortSignal` later for
   client disconnect handling. Out of scope here; no action.

## Decision

Zero blockers. Clearing `gate:review` and `gate:evals`.
