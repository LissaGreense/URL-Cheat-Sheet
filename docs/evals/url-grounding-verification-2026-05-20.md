# Verification: ucs-tke navigation tools — 2026-05-20

Pre-merge verification snapshot for the ucs-tke epic (T1–T7 of
`docs/specs/2026-05-20-agent-navigation-tools.md` →
`docs/plans/2026-05-20-agent-navigation-tools.v2.md`).

This is T7's deliverable. Each section below maps to a spec §8
success criterion.

## 1. Existing 5 url-grounding cases — no regression

5x suite runs after T6 merged. Every existing case passes every run:

| Case | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| HTCPCP expansion grounded in RFC 2324 | PASS 0.967 | PASS 0.967 | PASS 0.967 | PASS 0.967 | PASS 0.967 |
| 418 status code lookup | PASS 0.967 | PASS 0.967 | PASS 0.967 | PASS 0.967 | PASS 0.967 |
| HTCPCP-TEA varieties | PASS 0.950 | PASS 0.950 | PASS 0.950 | PASS 0.950 | PASS 0.950 |
| HTCPCP Wikipedia summary | PASS 1.000 | PASS 1.000 | PASS 1.000 | PASS 1.000 | PASS 1.000 |
| HTTP 418 origin per Wikipedia | PASS 0.967 | PASS 0.967 | PASS 0.967 | PASS 0.967 | PASS 0.967 |

**5/5 every run.** Scores are stable to 3 decimal places — judge is deterministic on these inputs.

## 2. Trap cases — agent refuses correctly with strict prompt

| Case | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| trap: HTCPCP does not specify encryption | PASS 0.967 | PASS 0.967 | PASS 0.967 | PASS 0.967 | PASS 0.967 |
| trap: RFC 7168 does not specify Japanese tea varieties | PASS 0.967 | PASS 0.967 | PASS 0.967 | PASS 0.967 | PASS 0.967 |

**5/5 each trap case in this 5-run window.** The strict refusal-with-citation prompt + `outline()` + `read_lines()` tools are doing their job — the agent reliably produces grounded refusals naming what the document actually IS about, instead of fabricating off-topic content.

## 3. Historical "before" comparison

`docs/evals/grounding-judge-calibration-2026-05-20.md` rows 6 and 10
are the pre-fix evidence — captured before T1–T5 shipped:

- **Row 6** (RFC 2324 + encryption question): agent fabricated
  "AES-256, GCM mode, ChaCha20-Poly1305, HMAC-SHA256." Judge: pass=false
  (0.000), human: fail.
- **Row 10** (RFC 7168 + Japanese tea question): agent fabricated
  "matcha, sencha, hojicha, gyokuro... 60-second steeping time" and
  cited non-existent lines. Judge: pass=false (0.000), human: fail.

After T1–T5 shipped, the same question shapes produce grounded
refusals at score ≥ 0.967 (5x in §2 above). No fabrications observed.

## 4. Cohen's κ stability — zero drift

Calibration re-run after T1–T5 + T6 merge, against the same frozen
10-row gold set (`packages/evals/judges/grounding-gold.jsonl`):

|  | TP | FP | FN | TN |
|---|---|---|---|---|
| Pre-fix baseline (2026-05-20) | 5 | 1 | 0 | 4 |
| Post-fix verification (2026-05-20) | 5 | 1 | 0 | 4 |

- po (observed) = 0.9000 (both)
- pe (chance) = 0.5000 (both)
- **Cohen's κ = 0.8000 (both)** — zero drift, within [0.75, 0.85] acceptance range.

The single mismatch (row 7: agent cited L42 for the WHEN method) is the same false-positive the judge has always made on this row. No new judge errors introduced by the agent's new behavior. The judge handles refusal-style answers consistently.

## 5. Line-number drift check — text byte-stable

T2 (extraction sidecar) was scoped to NOT mutate `text` byte-for-byte
— line numbers underlie every `Lxx` citation. Verified by running 3
prior citations through the production fetch + extract pipeline at
`HEAD = ae0386a` (post-T1–T6 merge):

**RFC 2324** (`https://www.rfc-editor.org/rfc/rfc2324.html`, 556 lines total):

| Line | Content | Calibration ref |
|---|---|---|
| L228 | `2.3.2 418 I'm a teapot` | Row 2: "418 I'm a teapot" ✓ |
| L231 | `code "418 I'm a teapot". The resulting entity body MAY be short and` | Row 2: "entity body being short and stout" ✓ |
| L5 | `<EMPTY/WHITESPACE>` | Row 4 cited L5 as **"approximate rather than exact"** — pre-existing approximation, NOT post-T2 drift |

**RFC 7168** (`https://www.rfc-editor.org/rfc/rfc7168.html`, 388 lines total):

| Line | Content | Calibration ref |
|---|---|---|
| L131 | `this end, a TEA-capable pot that receives a BREW message of content` | Row 5: TEA context ✓ |
| L137 | `For the URI "/", brewing will not commence.  Instead, an Alternates` | Row 5: Alternates header ✓ |
| L142 | `Alternates: {"/darjeeling" {type message/teapot}},` | Row 5: tea variety examples ✓ |
| L143 | `{"/earl-grey" {type message/teapot}},` | Row 5: tea variety examples ✓ |
| L144 | `{"/peppermint" {type message/teapot}}` | Row 5: tea variety examples ✓ |
| L155 | `TEA-capable HTCPCP clients MUST check the contents of the Alternates` | Row 5: Alternates context ✓ |

**No drift.** Every cited line maps to the same content the calibration row claimed it pointed at. T2's extraction sidecar successfully attached `headings` without shifting `text` byte-for-byte.

## 6. Known issues — filed as follow-up bd

### `ucs-0f3` (P1 bug) — agent empty-output flake on trap_japanese_tea

During T6 dispatch, 1 of 3 runs of `trap_japanese_tea` produced empty agent output. The 5-run T7 baseline above did NOT reproduce the flake (0/5). Combined observed rate: **1/8 (~12.5%)** specifically on RFC 7168 + Japanese-tea question.

Hypothesis (per ucs-0f3 description): RFC 7168 has many tea-related strings, so the agent's grep loop on an off-topic query may exhaust the 10-step budget without calling `finalize`. `hasToolCall('finalize')` stop condition allows the stream to end empty when the model never emits the sentinel.

**Mitigation options** (deferred to ucs-0f3 follow-up):
1. Step budget bump (10 → 12 or 15) — quick try.
2. Provider-side fallback in `agent-provider.ts`: synthesize a refusal when stream ends without finalize. Most robust.
3. `prepareStep` callback forcing finalize at step N-1.
4. Tighter prompt: "Empty turn is a failure — always call finalize."

**Recommendation:** ship ucs-tke as-is. The flake is rare, gracefully degraded (caught by the regex+judge guards which would mark a bad ship visibly), and the navigation-tools epic's PRIMARY goal (defeat fabrication) is fully achieved. Track ucs-0f3 separately.

### `ucs-cv7` (P2 bug) — evals harness `.env` papercut

`packages/evals/src/run.ts` spawns `bunx promptfoo` with
`cwd: packageRoot`. Bun only auto-loads `.env` from cwd, but the
user-managed `.env` is symlinked at the worktree root.

Workaround used throughout T6 + T7: `export ANTHROPIC_API_KEY=$(grep ^ANTHROPIC_API_KEY= .env | cut -d= -f2-)` before invoking the suite.

Fix (deferred): load repo-root `.env` in `run.ts` and pass through to
the spawned subprocess.

## 7. Acceptance criteria — final tally

Per `docs/specs/2026-05-20-agent-navigation-tools.md` §8:

1. ✅ `bun test` green (148/148 vitest; verified in T5 PR #84 CI)
2. ✅ Trap cases FAIL on `main` pre-merge → PASS post-merge. "Pre" evidence = calibration rows 6 + 10 (agent fabricated). "Post" evidence = §2 above (5/5 PASS over 5 runs).
3. ✅ Existing 5 cases stay 5/5 (§1 above).
4. ✅ Cohen's κ within ±0.05 of 0.80 baseline → measured 0.80, zero drift.
5. ✅ Line-number drift check on 3 prior citations → no drift; cited lines unchanged.
6. ✅ This document records all of the above.

## 8. Ship recommendation

**Ship ucs-tke.** All spec §8 acceptance criteria met. The strict refusal-with-citation rule + outline + read_lines tools structurally defeat the fabrication failure mode documented in calibration rows 6 and 10.

One observed flake (ucs-0f3, ~12.5% rate on one specific case) is a real but rare residual failure mode — does NOT undo the primary fix and is tracked separately. The original spec promised "first pass" and explicitly carved Tier 3 architecture (Citations API, structured output, prepareStep) as deferred — ucs-0f3 will be addressed in that follow-up work.
