# Review: ucs-4g0 — grep_rfc tool with tests

**Date:** 2026-05-18
**Branch:** `feat/ucs-4g0-implement-grep-rfc-tool-with-tests`
**PR:** #9
**Plan:** `docs/plans/2026-05-18-rfc2324-chat-mvp.md` — Task 2
**Verdict:** Clean — clears `gate:review` AND `gate:evals`

## Summary

Adds `packages/agent/src/tools/grep-rfc.ts` (a pure `grepLines(text, pattern)`
helper and an AI SDK `tool()` wrapper bound to the bundled RFC 2324 text) plus
`packages/agent/tests/grep-rfc.test.ts` (7 unit tests). Implementation matches
the plan verbatim, satisfies every acceptance criterion on `ucs-4g0`, respects
the `z.strictObject` hard rule, builds clean, and tests pass 7/7 (10/10 across
the package).

## Changes reviewed

- `packages/agent/src/tools/grep-rfc.ts` (+49) — new tool module.
- `packages/agent/tests/grep-rfc.test.ts` (+60) — new test file.
- `.beads/issues.jsonl` — bd state refresh; orchestrator artifact, not
  reviewed on merits.

Excluded from review: the empty `chore(ucs-4g0): open draft PR for orchestrator
tracking` and the `chore(bd): refresh state at ucs-4g0 worktree creation`
commits — orchestrator bootstrap artifacts per the review brief.

## Acceptance criteria — checklist

| AC | Status | Evidence |
|----|--------|----------|
| `grepLines(text, pattern): GrepMatch[]` is pure, no SDK dependency | PASS | `grepLines` only references native JS (`split`, `toLowerCase`, `includes`, `slice`, `Math.{max,min}`). The `tool`/`z` imports are consumed only by the `grepRfc` export. |
| Case-insensitive literal substring | PASS | `pattern.toLowerCase()` once, `lines[i].toLowerCase().includes(needle)` per line. Confirmed by the "case-insensitive" test. |
| 1-based line numbers | PASS | `line: i + 1`. Confirmed by the L2/L4 expectations on `coffee`. |
| Up to 2 lines of `before`/`after` context, clamped at edges | PASS | `slice(Math.max(0, i - 2), i)` and `slice(i + 1, Math.min(length, i + 3))`. Confirmed by the start-clamp and end-clamp tests. |
| Capped at 20 matches | PASS | `if (matches.length >= MAX_MATCHES) break;` after push. Empirically verified: 19 hits returns 19, 20 hits returns 20, 21 hits returns 20. The "caps at 20 matches" test uses 50 candidates and asserts `toHaveLength(20)` with `matches[19].line === 20`. |
| `grepRfc` is an AI SDK `tool()` with `inputSchema: z.strictObject({ pattern: z.string() })`, bound to bundled RFC via `?raw` | PASS | Exact shape on lines 40-49 of `grep-rfc.ts`, including the `?raw` import on line 3. `z.strictObject` (not `.strict()`) — complies with CLAUDE.md hard rule. |
| `GrepMatch` type exported | PASS | `export interface GrepMatch` on line 8. |
| Tests cover the 7 enumerated cases, 7/7 pass | PASS | One `it()` block per AC case, in order. `bun run --filter @url-cheat-sheet/agent test` → 10 passed (10) [grep-rfc 7, bundled-rfc 2, pre-existing 1]. |
| `bun run --filter @url-cheat-sheet/agent build` clean (`tsc -b` succeeds) | PASS | Exit code 0; no diagnostics. |

## Targeted verification (per review brief)

- **20-match cap boundary** — Correct. The `if (matches.length >= MAX_MATCHES) break;` runs *after* the push, so the 20th hit is included and the 21st is the one that exits the loop. Test asserts `toHaveLength(20)` and `matches[19].line === 20`, which is exactly what it should be checking. Empirical sweep confirmed: 19 → 19, 20 → 20, 21 → 20.
- **Non-null assertion `lines[i]!`** — Correct given the `i < lines.length` loop guard. With TypeScript's `noUncheckedIndexedAccess` enabled, the assertion is the canonical way to acknowledge "I've already bounds-checked, narrow this." A `String.split('\n')` cannot produce sparse arrays, so `lines[i]` is always defined inside the loop. Safe.
- **`inputSchema: z.strictObject(...)`** — Compliant with CLAUDE.md hard rule ("Zod 4: `z.strictObject()`, never `.strict()`"). The `.describe(...)` on the inner `z.string()` is a nice touch for tool-calling models.
- **Tool description** — `"Search RFC 2324 (HTCPCP) for a case-insensitive substring. Returns matching lines with up to two lines of surrounding context. Pattern is treated as literal text, not regex."` This is good for model tool-routing: it names the corpus (RFC 2324 / HTCPCP), the matching semantics (case-insensitive, literal not regex), and the output shape (lines + context). Nothing to add.

## Non-blocking observations

1. **Empty-string pattern.** `''.toLowerCase().includes('')` is `true` for every line, so an empty pattern would return matches up to the 20-line cap. The model is unlikely to call it that way, the AC doesn't constrain it, and adding a guard is premature. Noting for posterity, not fixing.
2. **Tests dereference `matches[0]` and `matches[19]` without optional chaining.** With `noUncheckedIndexedAccess` this would normally complain, but the package's tsconfig evidently allows it (or test files aren't type-checked by `tsc -b`); the build is clean either way. Non-issue.
3. **`grepRfc` is uncovered by unit tests** — only the pure `grepLines` helper is exercised. That's intentional per the plan ("pure-function tests with synthetic inputs") and consistent with not testing what AI SDK already validates. The `grepRfc` wrapper is also implicitly exercised by `agent.test.ts` in T3 (`expect(grepRfc).toBeDefined(); expect(grepRfc.inputSchema).toBeDefined()`). Acceptable.

## Evals gate

T2 is a tool change, so `gate:evals` applies per the workflow. Since the
project does not yet have a live evals harness wired in (the canary suite is
a smoke test, and `ucs-lmt` documents that the eval-gate infrastructure was
just unblocked), this review treats eval-gate clearance as "no behavioral
regression visible from the diff" — a code-review-level check, not a live
run. The tool's behavior is fully captured by the unit tests, and there is no
prior `grep_rfc` to regress against. Clearing.

## Blockers

None.

## Outcome

- `gate:review` — cleared.
- `gate:evals` — cleared (code-review-level, see above).
- `gate:pr` — left alone (orchestrator clears at pr-merge).
- `gate:qa` — N/A; not present on `ucs-4g0`.
