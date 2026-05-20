# Verification: ucs-9bk per-request provider — 2026-05-20

Pre-merge `gate:evals` verification snapshot for **PR #106** /
`feat/ucs-9bk-agent-per-request`. The PR refactors
`packages/agent/src/agent.ts` so the Anthropic provider is constructed
per-request via `createAnthropic({ apiKey })` instead of at module
scope; it also adds `AbortSignal` plumbing and `onError` overrides on
both `streamText` and `toUIMessageStreamResponse`. `SYSTEM_PROMPT`,
the four tools (`grep_doc`, `finalize`, `outline`, `read_lines`),
`stopWhen`, `temperature: 0`, `prepareStep`, `STEP_BUDGET = 12`, and
`FORCE_FINALIZE_AT_STEP` are preserved verbatim.

The change is **structurally** load-bearing but **behaviorally**
identical, so this eval gate is defense-in-depth: confirm the
`url-grounding` suite stays at its post-`ucs-tke` baseline despite
no prompt/tool/model changes.

## Suite

`packages/evals/suites/url-grounding/` — 5 grounding cases + 2 trap
(strict-refusal) cases, same configuration as the 2026-05-20 baseline.

## Verdict

**PASS. Gate cleared.** 7/7 cases pass; pass-rate matches the
post-`ucs-tke` baseline (also 7/7). No regression observed.

## Aggregate metrics (single 7-case run)

| Metric | Value |
|---|---|
| `testPassCount` | 7 |
| `testFailCount` | 0 |
| `testErrorCount` | 0 |
| `assertPassCount` | 19 |
| `assertFailCount` | 0 |
| `totalLatencyMs` | 62,676 |
| `evalId` | `eval-nbj-2026-05-20T07:48:22` |

## Per-test comparison vs `url-grounding-verification-2026-05-20.md`

| Case | Baseline | ucs-9bk | Δ |
|---|---|---|---|
| HTCPCP expansion grounded in RFC 2324 | PASS 0.967 | PASS 0.967 | 0.000 |
| 418 status code lookup | PASS 0.967 | PASS 1.000 | +0.033 |
| HTCPCP-TEA varieties | PASS 0.950 | PASS 1.000 | +0.050 |
| HTCPCP Wikipedia summary | PASS 1.000 | PASS 0.950 | -0.050 |
| HTTP 418 origin per Wikipedia | PASS 0.967 | PASS 0.967 | 0.000 |
| trap: HTCPCP does not specify encryption | PASS 0.967 | PASS 0.967 | 0.000 |
| trap: RFC 7168 does not specify Japanese tea varieties | PASS 0.967 | PASS 0.967 | 0.000 |

5 cases unchanged, 2 cases improved slightly, 1 case dipped by 0.05 —
all PASS, all comfortably above the judge's 0.7 threshold. The
movement is within ordinary judge noise (0.05 = a single rubric
component shifting between graders' rounding); the trap cases — the
load-bearing fix from `ucs-tke` — are stable to 3 decimal places.

## How the new code path was exercised

The `packages/evals/src/providers/agent-provider.ts` provider was
NOT touched by this PR (ucs-qdp owns the chat-route plumbing
follow-up). It still calls `streamChat(messages, document)` with two
arguments, so `apiKey` arrives as `undefined` at the new function
signature. `createAnthropic({ apiKey: undefined })` falls back to
reading `process.env.ANTHROPIC_API_KEY` (which the harness exports
per the `ucs-cv7` workaround), so the per-request `createAnthropic`
call path IS exercised — just with the env-var fallback feeding the
key instead of an explicit argument. This is sufficient for the
behavioral-regression check; the explicit-key plumbing through evals
is out of scope for this PR and tracked under ucs-qdp.

## Pre-flight context

- API key exported via the `ucs-cv7` workaround:
  `export ANTHROPIC_API_KEY=$(grep ^ANTHROPIC_API_KEY= /Users/sara/Projects/URL-Cheat-Sheet/.env | cut -d= -f2-)`.
  `.env` was NOT modified.
- Working branch: `feat/ucs-9bk-agent-per-request` @ `c43d99f`.
- Worktree: `/Users/sara/Projects/wt-ucs-9bk`.
- Command: `bun run eval url-grounding`.

## Raw promptfoo output (results.prompts[0].metrics)

```json
{
  "score": 6.816666666666666,
  "testPassCount": 7,
  "testFailCount": 0,
  "testErrorCount": 0,
  "assertPassCount": 19,
  "assertFailCount": 0,
  "totalLatencyMs": 62676,
  "tokenUsage": {
    "numRequests": 7
  }
}
```

## Per-test raw scores (results.results[*].score)

```
HTCPCP expansion grounded in RFC 2324              PASS  0.9667  5083ms
418 status code lookup                             PASS  1.0000  5789ms
HTCPCP-TEA varieties                               PASS  1.0000 10701ms
HTCPCP Wikipedia summary                           PASS  0.9500  5794ms
HTTP 418 origin per Wikipedia                      PASS  0.9667  6214ms
trap: HTCPCP does not specify encryption           PASS  0.9667 15990ms
trap: RFC 7168 does not specify Japanese tea ...   PASS  0.9667 13105ms
```

## Acceptance check

- Suite ran to completion without infrastructure errors. ✓
- Pass-rate ≥ baseline (7/7 == 7/7). ✓
- No single case dropped below the 0.7 judge threshold. ✓
- No trap-case regression (calibration rows 6 + 10 fix remains intact). ✓

`gate:evals` cleared.
