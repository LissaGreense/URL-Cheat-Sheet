# Spec: grounding-judge redesign with document context

**Date:** 2026-05-20
**Status:** Draft — pending review
**Closes:** `ucs-tkq`
**Followup of:** `docs/specs/2026-05-19-grounding-eval-matrix.md`
**Snapshot that motivated it:** `docs/evals/url-grounding-2026-05-19.md`

## Problem

The first live snapshot of the `url-grounding` matrix showed **0/5 LLM-rubric
passes**, with every grading "reason" hedging:

> "Without access to the source document, I cannot verify the citation."

The rubric is structurally ungradable: promptfoo's `llm-rubric` template
context contains only `output`, `rubric`, and flat `test.vars` — the source
document text computed by the provider during the agent run is unreachable.

A judge that can't see the document can't grade groundedness. The matrix
runs, but the LLM-rubric column is decorative.

## Goal

Make the LLM judge for the `url-grounding` suite actually grade. Concretely:

1. Pipe the document text from the agent provider to the judge via
   `ProviderResponse.metadata`.
2. Replace the broken `llm-rubric` with a custom JavaScript-typed assertion
   that reads provider metadata, calls a frontier-class judge model with the
   document + answer + question in scope, and returns a `GradingResult`.
3. Pick the judge model + pass threshold based on the research summarised
   below — not vibes.
4. Ship a hand-labeled gold set + a Cohen's κ calibration script so the
   judge's quality is independently measurable and the escalation rule is
   mechanical, not subjective.

## Non-goals

- Multi-judge ensembling (e.g. averaging haiku + sonnet verdicts).
- Cross-family sanity checks against GPT / non-Anthropic providers — carved as
  a separate quarterly-cadence bd issue once v1 is proven.
- Promoting calibration to a pre-merge gate. v1: developer-run on-demand.
- Re-architecting the provider's response shape (`output` stays as the
  drained assistant text).
- Windowing or truncating long documents. Our 5 KB URLs all fit; deal with
  the giant-doc case if it bites.

## Design

### Why a custom JS assertion (verified, not guessed)

Probed `node_modules/.bun/promptfoo@0.121.11/.../dist/`:

- `llm-rubric` template context is `{ output, rubric, ...test.vars }`.
  `ProviderResponse.metadata` is NOT exposed. Dead end.
- `rubricPrompt` shares the same limited template context. Dead end.
- `transform` / `contextTransform` / `assert-set` cannot mutate `test.vars`
  for downstream `llm-rubric` consumption.
- **`type: javascript` assertions** receive
  `AssertionValueFunctionContext`, which DOES include
  `providerResponse: ProviderResponse | undefined` with full
  `metadata` access. This is the supported integration point.

So the architecture is forced: the judge runs from a JS-typed assertion
file, not from `llm-rubric`.

### Architecture

```
packages/evals/
├── judges/
│   └── grounding-gold.jsonl           # NEW — 10 hand-labeled examples
├── src/
│   ├── providers/
│   │   └── agent-provider.ts          # modified — attach metadata.document
│   ├── judges/
│   │   └── grounding-judge-core.ts    # NEW — pure: (input) → Promise<Verdict>
│   ├── asserts/
│   │   └── grounding-judge.ts         # NEW — thin: adapts assertion context
│   └── calibrate-judge.ts             # NEW — script: gold-set + Cohen's κ
├── tests/
│   ├── agent-provider.test.ts         # modified — assert metadata.document
│   ├── grounding-judge-core.test.ts   # NEW — mocked Anthropic call
│   └── grounding-judge.test.ts        # NEW — assertion-adapter unit test
└── suites/
    └── url-grounding/
        └── promptfooconfig.yaml       # modified — replace llm-rubric
```

`-core.ts` is the only file that calls Anthropic. Both the assertion (live
graders during `bun packages/evals/src/run.ts url-grounding`) and the
calibration script use it. The judge model is a parameter, defaulted to
`claude-sonnet-4-6`, so calibration can experiment without forking.

### Provider modification

`callApi`'s happy path returns:

```ts
return {
  output: <drained assistant text>,
  metadata: {
    document: {
      text: extractResult.text,
      title: extractResult.title,
      sourceUrl: fetchResult.value.finalUrl,
    },
  },
};
```

`ProviderResponse.metadata` is open-ended `Record<string, any>` (verified
in installed types). Failure paths (`{ error }`) do NOT set `metadata` —
the assertion handles missing metadata as a fail with a clear reason.

### Judge core contract

`packages/evals/src/judges/grounding-judge-core.ts`:

```ts
export interface GradingInput {
  question: string;
  output: string;
  document: { text: string; title: string; sourceUrl: string };
  judgeModel?: string;   // defaults to claude-sonnet-4-6
}

export interface Verdict {
  pass: boolean;
  score: number;        // 0..1
  reason: string;       // one-sentence judge explanation
  raw: string;          // raw judge response, for debugging
}

export async function gradeGrounding(input: GradingInput): Promise<Verdict>;
```

Inside:
1. Build the judge system prompt (a single `JUDGE_SYSTEM` constant) and the
   per-call user prompt (question + output + document).
2. Call `generateText` from `@ai-sdk/anthropic` with `temperature: 0`. No
   streaming — one-shot completion.
3. Parse a JSON object on a single line: `{ pass, score, reason }`. If
   parsing fails, return
   `{ pass: false, score: 0, reason: 'judge returned malformed JSON', raw }`.
4. Validate `score ∈ [0, 1]`; if out of range or missing, treat as a parse
   failure.
5. Apply the 0.7 threshold: the judge's claimed `pass` is informative but
   the assertion's `pass` is `score >= 0.7` — this insulates us from a
   miscalibrated judge contradicting its own score.

### Judge prompt

```
You are grading whether an AI assistant's answer is grounded in a source
document.

You receive:
- The user's question
- The assistant's answer
- The full source document text

Grade on a single 0-1 score:
- Does the answer address the question?
- Does it cite at least one line reference in the form Lxx (xx = a number)?
- Do the cited lines exist in the document AND support the claim?
- Does the answer avoid stating facts not present in the document?

Line numbers reference the document text split on newlines, 1-indexed.

Return ONLY a JSON object on a single line, no markdown fences:
{"pass": boolean, "score": number, "reason": "one sentence"}

pass MUST equal (score >= 0.7).
```

User prompt is built per-call:

```
Question:
<question>

Assistant's answer:
<output>

Source document (title: <title>, sourceUrl: <sourceUrl>):
<full document.text>
```

### Assertion adapter

`packages/evals/src/asserts/grounding-judge.ts`:

```ts
import type { AssertionValueFunctionContext, GradingResult } from 'promptfoo';
import { gradeGrounding } from '../judges/grounding-judge-core';

export default async function gradeGroundingAssertion(
  output: string,
  context: AssertionValueFunctionContext,
): Promise<GradingResult> {
  const doc = context.providerResponse?.metadata?.document;
  if (!doc?.text || !doc.title || !doc.sourceUrl) {
    return { pass: false, score: 0, reason: 'no document attached to provider response' };
  }
  const question = context.vars?.question;
  if (typeof question !== 'string') {
    return { pass: false, score: 0, reason: 'no question in context.vars' };
  }
  const v = await gradeGrounding({ question, output, document: doc });
  return { pass: v.pass, score: v.score, reason: v.reason };
}
```

The threshold (0.7) lives in `-core.ts`, not the adapter.

### YAML change

In `defaultTest.assert`:

- Replace the `llm-rubric` entry with:
  ```yaml
  - type: javascript
    value: 'file://../../src/asserts/grounding-judge.ts'
  ```
- Remove `defaultTest.options.provider` — no `llm-rubric` left to grade.
- Keep the `regex: 'L\d+'` cheap signal as-is.

### Gold set

`packages/evals/judges/grounding-gold.jsonl` — 10 hand-crafted examples
covering deliberate failure modes:

| # | Class | Failure mode covered |
|---|---|---|
| 1 | known-good | Correct claim, valid Lxx, supports |
| 2 | known-good | Correct claim, multiple Lxx |
| 3 | known-good | Brief but grounded answer |
| 4 | known-good | Correct claim about a stable historical fact |
| 5 | known-good | Correct claim, longer answer (3+ sentences) with multiple citations |
| 6 | known-bad | Fabricated fact not in document |
| 7 | known-bad | Citation to real line that doesn't support the claim |
| 8 | known-bad | Citation to non-existent line (L9999) |
| 9 | known-bad | Missing citation entirely |
| 10 | known-bad | Mismatched paraphrase — answer drifts beyond what the doc says |

Each row: `{description, question, output, document: {text, title, sourceUrl}, humanVerdict, humanReason}`.

Use the 5 existing KB URLs as document sources (RFC 2324, RFC 7168, two
Wikipedia articles). Document text is captured once at gold-set-authoring
time and embedded — this is a calibration fixture, not a live extraction
test.

### Calibration script

`packages/evals/src/calibrate-judge.ts`:

1. Load `packages/evals/judges/grounding-gold.jsonl`.
2. For each row, call `gradeGrounding(...)` from `-core.ts`.
3. Compute confusion matrix (TP/TN/FP/FN) against `humanVerdict`.
4. Compute Cohen's κ.
5. Print summary table + per-example mismatches with reasons.
6. Exit 1 if κ < 0.6 (the escalation trigger).
7. Always write a snapshot to
   `docs/evals/grounding-judge-calibration-<YYYY-MM-DD>.md` containing the
   confusion matrix, κ, and the per-example mismatch list.

Invocation: `bun packages/evals/src/calibrate-judge.ts`.

Not wired into CI. Developer runs after rubric or model changes; the most
recent snapshot lives in `docs/evals/` for audit.

### Acceptance criteria

1. `agent-provider.ts` attaches `metadata.document = { text, title, sourceUrl }` on the happy path; failure paths still return `{ error }` with no metadata.
2. `grounding-judge-core.ts` exports `gradeGrounding` with the documented contract; default `judgeModel = 'claude-sonnet-4-6'`; temperature 0; threshold 0.7.
3. `grounding-judge.ts` (assertion) handles missing metadata + missing question with clear fail reasons; otherwise delegates to `-core`.
4. `grounding-gold.jsonl` exists with the 10 examples described above (5 good, 5 bad).
5. `calibrate-judge.ts` runs end-to-end against the gold set; prints κ; writes a snapshot.
6. Calibration κ is **>= 0.6** on the committed gold set with `claude-sonnet-4-6` as judge.
7. Suite YAML uses the new assertion; no `llm-rubric` left.
8. Unit tests cover: prompt building, JSON parse happy path, malformed JSON, missing metadata, missing question, score out of range. All green.
9. Live suite re-run produces non-hedging judge reasons (no "I cannot verify"). The snapshot commits.

### Risks and how we mitigate

- **Judge variance** — temperature 0.
- **Document token budget** — our 5 docs all fit. If a future URL produces >100K tokens, the judge call will fail loudly. Accepted.
- **Sonnet self/family inflation** — documented at 5–10pt for verification tasks. The gold set + κ check is the mitigation; the escalation rule (κ < 0.6 → Opus or cross-family) is mechanical, not vibes.
- **Empty extraction (RFC 7168 case)** — judge correctly receives empty text and should return a fail with reason "document has no extractable text". Gold-set example covers this.
- **Provider metadata propagation regression** — `agent-provider.test.ts` gains a test asserting metadata is set on success.

## Research that informed the choices

Two parallel research streams (papers/biases vs. RAG-framework practice)
produced converging-but-not-identical recommendations. Synthesis:

- **Threshold 0.7**: Ragas community practice flags `<0.8`; DeepEval ships
  `0.5` (too permissive for grounding); promptfoo `llm-rubric` has no
  default. 0.7 sits above the documented inflation band and below the
  near-perfect band.
- **Judge model `claude-sonnet-4-6`**: middle ground between Opus
  (overkill cost at our volume for marginal gain) and Haiku (RAGTruth-class
  evidence suggests too weak on citation faithfulness — GPT-4 only gets
  64% F1, smaller models worse). Sonnet is also what promptfoo's own
  auto-selector picks when an Anthropic key is present.
- **Gold-set calibration with Cohen's κ ≥ 0.6**: Anthropic explicitly
  recommends "regular calibration against human experts"; futureagi and
  others document κ ≥ 0.6 as the common bar.

Cited works that anchored the recommendation:

- Zheng et al., "Judging LLM-as-a-Judge" — MT-Bench, GPT-4 >80% human-agreement.
- Niu et al., RAGTruth — GPT-4 63-64% F1 on response-level hallucination.
- Min et al., FACTSCORE — factual-precision grading benchmark.
- Anthropic eval docs — "code-based grading is fastest and most reliable;
  use LLM grading for what code can't capture; calibrate against humans".
- Ragas / DeepEval / TruLens / OpenAI Evals / Promptfoo — surveyed default
  judges and thresholds.

## Out of scope (restated)

- GPT / cross-family judges.
- Pre-merge calibration gate.
- Multi-judge ensembling.
- Long-document windowing.
- Re-architecting `ProviderResponse.output` shape.

## Followups to file post-merge

- Quarterly cross-family κ sanity check (GPT-5 or Gemini against gold set).
- Promote calibration to a CI gate if drift becomes recurrent.
- Expand gold set to 20-30 examples once we've stress-tested the v1 set.
