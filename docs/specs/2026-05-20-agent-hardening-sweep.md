# Spec: agent hardening sweep

**Date:** 2026-05-20
**Status:** Draft — pending review
**Umbrella for:** `ucs-3cv` (originally the step-budget bug; now scoped to the whole sweep)
**Closes via the sweep:** the recurring empty-output failure mode observed in `ucs-6gd` (closed-superseded) and `ucs-xom` (closed via defensive judge guard).

## Problem

The URL-grounded chat agent (`packages/agent/src/agent.ts`) has a recurring
failure mode: on tool-heavy questions, the model burns its entire 5-step
budget on `grep_doc` tool calls without ever emitting final text. The
client receives empty output. Empty output is **not** an acceptable
failure mode — it's a UX disaster (user sees nothing) and a measurement
failure (`grounding-judge` now defends against it, but that's a safety
net, not a fix).

Two parallel audits — one internal (read every file in `packages/agent/`),
one external (survey of RAG-agent best practice via WebSearch) — converged
on a punch list of cheap tunings that should ship + eval-test individually,
plus a backlog of bigger architectural ideas that should be documented but
not shipped yet. The audit findings are embedded directly into the Tier 1,
Tier 2, and Tier 3 sections below; no separate audit document.

## Goal

Guarantee that the agent never produces empty output on a well-formed
question; tighten citation precision; tune the agent loop's behavior on
tool-heavy questions. Each tuning ships as its own PR with a before/after
eval comparison so individual contributions are measurable.

## Non-goals

- Replace `grep_doc` with Anthropic's first-party Citations API.
- Multi-grep batch tool.
- Citation-verifier post-pass / re-grep validation.
- Retrieval planning step (forced 1-2 line plan on step 1).
- Structured output schema (`{answer, citations: […]}`).
- Top-K reranking on saturated matches.
- Swap to Opus or any non-Sonnet judge/agent model.

All listed non-goals are real ideas captured in the Tier 3 architecture
doc (see § "Tier 3 — backlog (documented, not shipped)" below). The
sweep is the cheap surface; the doc is the design backlog.

## Tier 1 — quick wins (one PR each, eval-tested)

### T1: `temperature: 0`

**Change:** `packages/agent/src/agent.ts` — add `temperature: 0` to the
`streamText` options.

**Why:** Default temperature drifts citations and reproducibility
run-to-run. Anthropic explicitly recommends `temperature: 0` for
analytical / grounded QA tasks. Sonnet 4.5+ requires `temperature`
xor `top_p` (not both); `top_p` is unset, so `temperature: 0` is safe.

**Acceptance:** suite snapshot reproducible across two consecutive runs
(same pass set, same citations). κ on the calibration gold set stable
within ±0.05.

### T2: bump `stepCountIs(5)` → `stepCountIs(8)`

**Change:** `packages/agent/src/agent.ts` — change the literal `5` to `8`.

**Why:** AI SDK v6's default cap when tools are present and `stopWhen`
is omitted is `20`. Field guidance for grounded-RAG agents is 8–10.
`5` is the literal floor; one bad exploratory grep starves the
final-text step.

**Acceptance:** url-grounding test 2 (HTCPCP-TEA varieties on RFC 7168)
ships a non-empty answer with at least one `Lxx` citation. Other 4 tests
unchanged.

### T3: system-prompt rewrite

**Change:** `packages/agent/src/prompt.ts` — rewrite `SYSTEM_PROMPT` to
include:

1. Budget rule at the TOP and repeated near the end:
   > You have at most 8 tool calls per turn. Reserve at least one step
   > for your final answer — never end a turn without text.
2. Never-empty rule:
   > Always produce a final answer. If `grep_doc` returns no useful
   > matches after two attempts on related queries, say so honestly —
   > "I couldn't find this in the document" is a valid answer.
3. Strict `Lxx` format:
   > Cite line numbers exactly as returned by `grep_doc` in the form
   > `Lxx` (e.g., `L142`, `L228-L231`). Do not estimate or round.
   > Every factual claim must end with an `Lxx` citation; uncited
   > claims are forbidden.

**Why:** Anthropic Prompting 101 recommends putting critical
constraints first AND repeating them. Current prompt has no budget
guidance, no never-empty rule, and a fuzzy citation example. Calibration
row 5's "approximate line numbers" complaint is direct evidence the
citation rule needs tightening.

**Acceptance:** url-grounding suite reasons no longer contain
"approximate" / "rounded" qualifiers on citations. κ on calibration set
≥ 0.80 (current baseline).

### T4: tighten `grep_doc` tool description

**Change:** `packages/agent/src/tools/grep-doc.ts` — extend the tool's
`description` field with phrasing guidance and empty-match handling:

> Case-insensitive substring search over document lines, with ±2 lines
> of context. Returns matching lines labeled `Lxx`. Use short
> distinctive substrings — section headings, unique nouns — not full
> sentences. Empty results mean the term is not in the document;
> retry at most once with a synonym, then give up and answer honestly.

**Why:** Current description is terse. Better tool descriptions
demonstrably reduce redundant calls (Anthropic tool-use docs +
Adamo's loop-prevention writeup). The 20-match cap also means broad
terms saturate the result window — steering toward distinctive needles
up front cuts wasted greps.

**Acceptance:** per-test `numRequests` in the suite snapshot trends
down vs the 2026-05-20 baseline. Suite pass count does not regress.

## Tier 2 — structural fix (one PR, slightly bigger)

### T5: `finalize` sentinel tool + `hasToolCall('finalize')` stop

**Change:** add a new tool `packages/agent/src/tools/finalize.ts` and
wire it into `agent.ts`:

```ts
// finalize.ts — sketch (impl agent confirms exact AI SDK tool() shape)
export const finalize = tool({
  description: 'Emit your final answer. ALWAYS call this exactly once at the end of your turn. The contents of `answer` and `citations` will be shown to the user.',
  inputSchema: z.strictObject({
    answer: z.string().min(1, 'answer must not be empty'),
    citations: z.array(z.string()).default([])  // e.g. ['L57', 'L228-L231']
  })
});
```

In `agent.ts`:

```ts
const result = streamText({
  model: anthropic('claude-sonnet-4-6'),
  system: SYSTEM_PROMPT,
  messages: …,
  tools: { grep_doc: …, finalize },
  stopWhen: [stepCountIs(10), hasToolCall('finalize')],
  temperature: 0,
});
```

The system prompt (T3) gets a new line: "End every turn by calling the
`finalize` tool with your answer + citations. Do not produce free-form
text outside `finalize`."

**Stream draining changes:** the user-visible answer now arrives as the
input arguments of the `finalize` tool call (specifically the `answer`
string), not as free-form text deltas in the stream. Two consumers must
be updated:

1. `packages/evals/src/providers/agent-provider.ts` — `drainAssistantText`
   currently joins `text`-type parts. After T5, it must additionally
   extract the `finalize` tool-call's `answer` argument (and optionally
   format the citations list into the returned string). If the agent
   never called `finalize` (budget exhausted), return empty — the judge's
   defensive guard from ucs-xom already handles this as fail.
2. `apps/web/src/routes/+page.svelte` — the `@ai-sdk/svelte` Chat
   component renders tool calls + tool results. Verify the `finalize`
   tool's `answer` displays naturally in the chat thread. If not,
   add a small renderer.

**Why:** This is the canonical Vercel/Anthropic pattern for guaranteed-
output agents (AI SDK Loop Control docs, Adamo's 5-patterns writeup,
Anthropic tool-use overview). It makes empty output **structurally
impossible**: either `finalize` fires (non-empty answer guaranteed) or
the step budget exhausts without `finalize` (typed error to caller, not
empty string).

**Acceptance:**

- New `finalize` tool defined in `packages/agent/src/tools/`.
- `streamChat` wires `stopWhen: [stepCountIs(10), hasToolCall('finalize')]`.
- System prompt instructs the model to ALWAYS call `finalize` at the
  end of its turn.
- Unit test: mock `streamText` and verify the tool definition is passed
  through correctly.
- Live eval: url-grounding suite produces non-empty output on all 5
  tests. Snapshot shows `answer` extracted from the `finalize`
  tool-call argument, not from free-form text deltas.
- Agent-provider's drain logic in `packages/evals/src/providers/agent-provider.ts`
  updated to extract from the `finalize` tool result. Existing
  metadata.document plumbing unchanged.
- Apps/web client (`apps/web/src/routes/+page.svelte`) verified to still
  display the answer correctly — AI SDK's `@ai-sdk/svelte` Chat
  component should handle tool-result rendering, but verify.

**Measured outcomes (post-merge, 2026-05-20):**

- Sonnet called `finalize` on 5/5 url-grounding tests. Zero skips.
  The speculated "may skip" failure mode was not observed; the
  step-budget backstop didn't need to fire.
- Calibration κ = 0.80 (TP=5, TN=4, FP=1, FN=0) — identical to the
  pre-T5 baseline. The speculated "judge sees different output shape"
  drift was zero. The single FP on calibration row 7 is the
  long-standing citation-mismatch judge weakness present since T2,
  not introduced by T5.

## Tier 3 — backlog (documented, not shipped)

### T6: write `docs/agent-hardening-roadmap.md`

**Change:** create a single markdown file capturing the Tier 3 ideas
with enough detail that a future plan can be written without re-doing
the audit. One paragraph per idea, with rationale + estimated effort
+ what it would improve.

The 6 ideas (from the internal + external audits):

1. **Anthropic Citations API** — first-party char-index citations,
   replaces `grep_doc`. Requires mapping char-index → `Lxx`. Improves
   citation precision; reduces tool-loop pressure.
2. **Multi-grep batch tool** — `grep_doc(patterns: string[])` returns
   `Record<pattern, matches[]>` in one call. Cuts N round-trips to 1
   for enumerative questions. Tool schema change only — stays inside
   the `streamChat` contract.
3. **Citation-verifier post-pass** — after `streamText` finishes, parse
   `L\d+` from response, re-grep at those lines, reject/annotate
   mismatches. Closes the citation-mismatch failure mode that κ
   currently catches as FP on row 7. Requires buffering the stream
   (UX trade-off).
4. **Retrieval planning step** — `prepareStep` callback that forces a
   1-2 line plan on step 1: "Question requires N facts; I'll grep for
   X, Y, Z." Reduces wasted greps on enumerative questions.
5. **Structured output schema** — model emits `{answer, citations}`
   directly via AI SDK's `experimental_output`. Makes the judge
   deterministic (no LLM-as-judge needed for citation validation).
   Affects schemas package + UI rendering — larger blast radius.
6. **Top-K reranking on saturated `grep_doc`** — when `grep_doc` hits
   its 20-match cap, score matches by section-heading proximity /
   surrounding-context tf-idf, return top-K instead of first-K.
   Self-contained change in `grep-doc.ts`; needs scoring heuristic
   tests.

**Acceptance:** doc lives at `docs/agent-hardening-roadmap.md` (one
top-level header per idea, ~150-300 words each), is linked from
`docs/README.md` if applicable, and is reachable by a future planner
without re-running the audit.

## Sequencing

Tier 1 ships **serially** — T1 → T2 → T3 → T4 → T5 — with the
calibration script (`bun packages/evals/src/calibrate-judge.ts`) and
the url-grounding suite (`bun packages/evals/src/run.ts url-grounding`)
re-run after each merge. Each PR's commit body captures:

- κ before vs after
- Suite pass-rate before vs after
- Per-test `numRequests` delta if relevant
- One-line conclusion: did this tuning help, hurt, or no-op?

T6 (architecture doc) is independent of T1-T5; it can ship in parallel
or any time before the umbrella closes.

The umbrella `ucs-3cv` closes when all 6 sub-issues merge.

## Eval methodology

For each Tier 1+2 merge:

1. After merge, the impl agent runs:
   ```bash
   bun packages/evals/src/calibrate-judge.ts
   bun packages/evals/src/run.ts url-grounding
   ```
2. Commits both new snapshots in the same PR.
3. Commit body cites the κ + suite-pass-rate delta vs the previous
   snapshot.

If κ regresses below 0.6 OR suite pass-rate regresses by >1 test, the
PR is BLOCKED on root-cause analysis before merge.

Cost per PR ≈ $1 (10 sonnet judge calls + 5 sonnet agent + 5 sonnet
judge). 5 PRs total ≈ $5.

## Acceptance criteria for the umbrella

The umbrella `ucs-3cv` closes when:

1. T1-T5 each merged with passing CI and a snapshot showing non-regress
   or improvement vs prior.
2. T6 merged with the architecture doc reachable from the docs tree.
3. The final url-grounding snapshot shows **5/5 non-empty outputs**
   across all tests — empty output is no longer observable.
4. Calibration κ stays at the 0.80 baseline (drift ≤ ±0.05 from the
   pre-sweep value). "κ ≥ 0.60" is the escalate-to-human threshold,
   not the acceptance bar.

The "5/5 non-empty" acceptance is the load-bearing one. It's what makes
empty-output structurally impossible in production.

## Out of scope (restated)

Non-goals from above + nothing else. No model swap, no judge changes
beyond what each tuning's calibration run reveals, no UI rework, no
schemas package changes (T5's `finalize` tool definition is inside
`packages/agent/src/tools/` — not a workspace `schemas` change).
