# Review report — agent-navigation-tools plan v1

**Plan:** `docs/plans/2026-05-20-agent-navigation-tools.md` (v1)
**Reviewer:** Claude (improving-plans skill)
**Date:** 2026-05-20
**Output:** `docs/plans/2026-05-20-agent-navigation-tools.v2.md`

## Context

v1 of the plan went through informal self-review only (3 fixes applied
inline after a user push-back: T1 schema path, T6 suite structure, T7
fetch+extract composition). This v1→v2 review is the formal
`superpowers:improving-plans` pass that was originally skipped.

## Method

Deep-read the following before reviewing:

- `docs/plans/2026-05-20-agent-navigation-tools.md` (v1 after the 3
  inline fixes)
- `docs/specs/2026-05-20-agent-navigation-tools.md`
- `packages/agent/src/agent.ts` — the `streamText` call site
- `packages/agent/src/prompt.ts` — current SYSTEM_PROMPT
- `packages/agent/src/tools/grep-doc.ts` — existing tool-factory pattern
- `packages/agent/src/tools/finalize.ts` — client-side sentinel pattern
- `packages/agent/src/url/extract.ts` — current extractor
- `packages/agent/tests/grep-doc.test.ts` — test-style baseline
- `packages/agent/tests/agent.test.ts` — what the agent tests assert
- `packages/evals/src/asserts/grounding-judge.ts` — judge entrypoint
- `packages/evals/src/judges/grounding-judge-core.ts` — judge prompt + threshold
- `packages/evals/src/providers/agent-provider.ts` — eval provider
- `packages/evals/suites/url-grounding/promptfooconfig.yaml` — suite shape
- `packages/schemas/src/extract.ts` — Document schema source
- `packages/schemas/src/chat.ts` — chat-request schema
- `apps/web/src/routes/api/extract/+server.ts` — extract endpoint
- `apps/web/src/routes/+page.svelte` — client Document construction

## Findings

Five new findings beyond what v1 self-review covered. Four are factual
defects (one correct fix each — applied directly in v2). One is a
design choice (offered to user, resolved).

### Finding 1 — DEFECT: Test files don't colocate

**v1 claim:** `packages/agent/src/tools/outline.test.ts`,
`packages/agent/src/tools/read-lines.test.ts`,
`packages/agent/src/url/extract.test.ts`.

**Reality:** Tests live in `packages/agent/tests/` flat. Convention
verified via `find packages/agent -name '*.test.ts'`:

- `src/tools/<x>.ts` → `tests/<x>.test.ts` (e.g. `grep-doc.test.ts`)
- `src/url/<x>.ts` → `tests/url-<x>.test.ts` (e.g. `url-extract.test.ts`)
- `src/<x>.ts` → `tests/<x>.test.ts` (e.g. `agent.test.ts`)

**Resolution in v2:** All test paths corrected. T2 step 6 commits to
`packages/agent/tests/url-extract.test.ts`; T3/T4 create files in
`packages/agent/tests/`; corresponding `bun test` invocations updated.

### Finding 2 — DEFECT: agent.test.ts:85 tool-keys assertion not addressed

**v1 claim:** T5 step 4 says "bun test should be green."

**Reality:** `packages/agent/tests/agent.test.ts:85` asserts
`expect(Object.keys(tools!).sort()).toEqual(['finalize', 'grep_doc'])`.
Once T5 registers `outline` and `read_lines`, this assertion fails.
v1 doesn't mention it.

**Resolution in v2:** T5 step 3 is a new dedicated step instructing
the impl agent to update the assertion to
`['finalize', 'grep_doc', 'outline', 'read_lines']` (alphabetically
sorted). Also adds an optional new test for the strict refusal rule.

### Finding 3 — DEFECT: `/api/extract/+server.ts` response constructor missing `headings`

**v1 claim:** Listed as a typecheck breakage site in T1 step 4; fix
"deferred to T5."

**Reality:** Lines 98-105 hand-construct the `ExtractResponse` object
literal. After T1, the response type requires `headings`. This is a
**production** site, not a test fixture — the deferred-to-T5 framing
in v1 was wrong because it bundles production wiring with the tool
registration in the same task. Also, the extractor's `headings` field
becomes available in T2; coupling the API forward of those headings
into the same commit is tighter (and means the `/api/extract`
endpoint never spends a commit returning an invalid shape).

**Resolution in v2:** T2 grows a new step (T2 step 5) that updates
`/api/extract/+server.ts` in the same commit as `extract.ts`. The
file structure map lists it as a Modify owned by T2.

### Finding 4 — DEFECT: `+page.svelte` Document literals missing `headings`

**v1 claim:** Listed as a typecheck breakage site; fix "deferred to T5."

**Reality:** Lines 51 and 63 explicitly construct `{ text, title,
sourceUrl }` from `preview`. Concrete fix is one line each:
`headings: preview.headings`. v1's "discoverable from typecheck"
framing is correct in principle but doesn't give the impl agent the
exact targeting they need; lines 51/63 deserve enumeration.

**Resolution in v2:** T5 step 4 is a new dedicated step naming both
line numbers and the exact change. Listed in the file structure map
as a T5-owned Modify.

### Finding 5 — DESIGN: Refusal phrasing needs explicit citation requirement

**Plan-level claim (spec §6, quoted verbatim by v1 T5 step 2):**
> "The document does not cover [topic]. It covers [brief summary from
> outline]." Do not fabricate content to fill the gap.

**Reality:** Two enforcement mechanisms in the eval pipeline require
at least one `Lxx` citation on every answer:

1. `packages/evals/src/judges/grounding-judge-core.ts` `JUDGE_SYSTEM`
   includes:
   > "Does it cite at least one line reference in the form Lxx?"
   > "Do the cited lines exist in the document AND support the claim?"
   With threshold 0.7, an answer without any `Lxx` will be graded as
   ungrounded and fail.

2. `packages/evals/suites/url-grounding/promptfooconfig.yaml`
   `defaultTest.assert` has `{type: regex, value: 'L\d+'}` applied
   to every case — a deterministic infra-level requirement.

The spec's quoted refusal example does not contain any `Lxx` reference.
If the agent emits that exact wording, the trap cases will fail
regardless of how correct the underlying refusal is. v1 inherits this
gap unchanged.

**Resolution in v2 (per user choice, strict prompt option):**
T5 step 2 replaces the soft v1 paragraph with a strict version that
mandates citation:

> "If you refuse, you MUST cite at least one `Lxx` pointing at the
> section that defines what the document actually IS about — example:
> 'The document does not cover encryption. It defines HTTP methods such
> as BREW (L142).' Do not fabricate content to fill the gap. Do not
> produce a refusal without an `Lxx` citation."

This is a **stricter rule than spec §6 prescribes**. v2 calls this out
explicitly in T5 step 2 so the impl agent doesn't try to honor the
spec's softer wording verbatim. Spec amendment (rewriting spec §6 to
include the strict wording) is a follow-up worth filing.

## Considered and rejected

### Heading endLine

Considered adding `endLine` to the `Heading` type so the agent can
issue `read_lines(h.line, h.endLine)` in one step. **Rejected by
user:** keeps the schema minimal; Sonnet at temp=0 can do the
arithmetic. Roll forward as v2 ships; revisit only if T7 verification
shows the agent fumbling the next-heading lookup.

### Structural `refuse` tool variant

Considered adding a sibling sentinel tool `refuse({topic, doc_covers,
citation})` with schema-required citation, so a refusal can't escape
the citation rule. **Rejected as over-engineering** for a 2-trap-case
eval — the strict-prompt approach (Finding 5) achieves the same
result with no new tool surface.

## Overlap with v1 self-review

The three fixes already applied to v1 inline (before this formal pass):

1. T1 file path: `packages/schemas/src/extract.ts` (was: "locate via grep")
2. T6 file structure: append to inline `tests:` array (was: per-case files in `cases/`)
3. T7 helper script: `safeFetch + extractContent` (was: invented `fetchAndExtract`)

These do not overlap with the 5 new findings. The v1 self-review was
focused on file paths and helpers; this formal pass found 4 additional
defects (test paths, test assertions, production wiring) plus 1 design
gap (judge/regex-vs-refusal-wording).

## Unresolved questions

None block v2 shipping, but worth noting:

1. **Spec §6 refusal wording.** v2 plan instructs the impl agent to use
   strict wording that the spec doesn't prescribe verbatim. A follow-up
   PR amending the spec to match would close the spec→plan drift.

2. **The `extract.ts` test path discrepancy.** v1 said
   `packages/agent/src/url/extract.test.ts` (colocated). v2 corrects to
   `packages/agent/tests/url-extract.test.ts` (flat). One question for
   the user/team: is the flat layout a deliberate choice, or a legacy
   pattern someone'd happily change? If someone wanted colocation, the
   new tools (outline, read_lines) would be the cleanest place to start
   — but breaking convention mid-PR is bad form, and the flat layout
   is what v2 ships.

3. **`packages/evals/src/providers/agent-provider.ts`.** Listed in v2
   as a possible Document literal site, marked "may pass through;
   check during T5." If it constructs a Document, T5 step 5 covers it.
   If it only passes through, no edit needed. Worth verifying during
   impl rather than locking down ahead of time.

## What v3 review (if any) would look at

After v2 ships through the orchestrator and we have actual T7
verification data, a v3 review (if needed) would examine:

- Did the agent actually use the fallback ladder, or did it skip
  `outline()` and just give up?
- Did the strict-refusal wording over-correct (e.g., agent now refuses
  on borderline questions where grep would have eventually hit)?
- κ stability under refusal-heavy cases — did the judge agree with
  human labelers on refusals?

These are runtime questions answered by T7's snapshots, not by static
review of the plan.
