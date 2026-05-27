## Review: feat/ucs-3bh-multiturn-tool-results

**Date:** 2026-05-27
**Branch:** feat/ucs-3bh-multiturn-tool-results
**PR:** #131
**Verdict:** APPROVED

## Summary

Fixes the intermittent `AI_MissingToolResultsError` on 2nd/3rd chat turns
by passing `ignoreIncompleteToolCalls: true` to `convertToModelMessages`.
Root cause is correctly attributed: a chat turn aborted or errored
mid-tool-execution leaves an assistant message with a tool part stuck at
state `input-available`. On the next turn, the AI SDK serializes that
part to a `tool-call` with no matching `tool-result`, and the model-prompt
validator throws. The fix is a one-line option flip with a WHY comment;
the test deterministically reproduces the failure path and fails when
the fix is reverted. 480/480 vitest cases pass.

## Critical

None.

## Important

None.

## Findings — by category

### Root cause (verified against AI SDK source)

- **Attribution is accurate.** `node_modules/ai/dist/index.js` lines
  8520-8528 contain the `convertToModelMessages` body: when
  `ignoreIncompleteToolCalls` is set, parts where `isToolUIPart(part)` AND
  `state in {input-streaming, input-available}` are filtered out. Without
  the flag, line 8612 emits a `tool-call` for any tool part whose state
  is not `input-streaming` (so `input-available` is included), but the
  switch at lines 8684-8716 only emits `tool-result` for states
  `output-denied | output-error | output-available`. An orphan
  `input-available` part therefore produces a `tool-call` with no
  matching result — and the validator at 1487-1499 throws
  `MissingToolResultsError`. The PR's commit-message root-cause and the
  WHY comment in `agent.ts` match this exactly.
- **The line refs in the issue brief are correct** (1488, 1499 for the
  throws; 8612 for the asymmetric emit; 8684-8716 for the result switch;
  8522 for the filter). Verified line-by-line.

### Correctness (positives)

- **Minimal, surgical layer.** The fix flips a documented AI SDK option
  instead of pre-processing `messages` in user code. The filter runs
  exactly once, at the same boundary that does the conversion — no
  duplicated logic, no second pass, no risk of drift between "what we
  strip" and "what the SDK accepts."
- **No data loss.** `isToolUIPart` (lines 5427-5429) returns true only
  for static or dynamic tool parts. Text, reasoning, file, and data
  parts in the same assistant message are preserved. The filter at 8525
  is a `parts.filter(...)` over the same message — so an assistant
  message that mixed `text` + an orphan `tool-grep_doc` keeps the text.
- **No retry-the-tool footgun.** An `input-available` part means the
  tool was called but never returned. There is no `output` to preserve
  and no `tool-result` exists in history — stripping the dangling call
  simply lets the model choose to call the tool again on the next turn
  if needed. That's the semantics `ignoreIncompleteToolCalls` is named
  after; no separate "did we lose work?" concern.
- **Single canonical entry point.** `convertToModelMessages` is called
  in exactly one place (`packages/agent/src/agent.ts:58`). Both the
  chat route (`apps/web/src/routes/api/chat/+server.ts:55`) and the
  evals provider (`packages/evals/src/providers/agent-provider.ts:88`)
  go through `streamChat`, so the fix lands for every consumer with
  zero cross-cutting changes.

### Tests (positives)

- **Deterministic and meaningful.** I temporarily reverted the fix and
  ran the suite: the new test fails (orphan `call_orphan` ID leaks into
  the `tool-call` set with no matching `tool-result`). Restoring the
  fix: all 480 tests pass. The test isn't a tautology — it asserts the
  exact invariant that, when violated, would re-trigger the production
  bug.
- **Mocks the right seam.** The test inspects the `messages` argument
  handed to `streamText` (the AI SDK boundary), not internal helpers.
  This is exactly the boundary the bug surfaces at, and it stays
  resilient to refactors of `streamChat` internals.
- **Reproduces the production failure shape.** A 3-message history
  (`user → assistant{orphan tool part} → user`) is the minimal shape
  that triggers the validator throw; matches the issue's
  reproduction (paste URL + ask follow-ups).
- **Per-call set comparison, not snapshot.** The assertion walks the
  generated `tool-call` and `tool-result` IDs and checks every call has
  a matching result, plus a specific `call_orphan` not-in-set check.
  Strong invariant, not brittle.

### Conventions (positives)

- **`chatRequestSchema` untouched.** Still `z.object(...)`. No schema
  drift. The fix lives entirely below the route boundary.
- **No `undici` / `node:http.Agent`, no `eslint-disable`, no
  `@ts-ignore`, no `@ts-expect-error`.** Confirmed with grep across the
  diff scope.
- **`as UIMessage[]` cast at the route boundary preserved.**
  `apps/web/src/routes/api/chat/+server.ts:56` still has the one-line
  bridge between `chatRequestSchema` (validates structure) and the AI
  SDK (validates each part shape inside `convertToModelMessages`). Fix
  is downstream of that cast.
- **`ANTHROPIC_API_KEY` (BYO) discipline intact.** Provider still
  constructed per-request, `apiKey` threading unchanged.
- **Comment policy.** The 7-line WHY comment in `agent.ts:51-57`
  explains *why* the option is set (the validator semantics it
  prevents), not *what* the line does — `ignoreIncompleteToolCalls:
  true` is self-documenting. Test JSDoc similarly explains the failure
  mode and the contract, not the mechanics. Matches the project rule.
- **JSDoc on the new test.** Repository convention honored.

## Needs Decision

- **PR body still has `<filled in by impl team at pr-ready>` placeholders.**
  The acceptance criterion ("Root cause identified and documented in PR
  description") is materially satisfied by the commit message body (`git
  log -1 71fd724`) and the code comments — but the PR body itself still
  has the orchestrator-template placeholders for "What changed", "Why",
  and "How". Not a merge blocker — the information exists in the repo —
  but the impl team or orchestrator should swap the placeholders for the
  commit-message text before merging so the GitHub-side audit trail is
  self-contained. Filed as a doc-hygiene note, not a blocking finding.
- **Acceptance-criteria smoke check (five turns + no error in server
  logs) is `gate:qa`'s job.** Flagged here for completeness; the parallel
  QA agent handles that loop. From the review side, the unit test
  proves the symbol-for-symbol invariant the production error
  violated.

## Relevant paths

- `packages/agent/src/agent.ts` — line 58 + WHY comment lines 51-57
- `packages/agent/tests/agent.test.ts` — lines 222-285 (JSDoc + new
  deterministic test)
- `apps/web/src/routes/api/chat/+server.ts` — unchanged, sole route caller
- `packages/evals/src/providers/agent-provider.ts` — unchanged, sole
  eval-side caller
- `node_modules/.bun/ai@6.0.184+.../node_modules/ai/dist/index.js` —
  lines 1487-1499 (validator throw), 8522-8528 (filter), 8612 +
  8684-8716 (asymmetric emit) — verified during review
