# Grounding Judge Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan-writing convention for this repo:** Per `.claude/skills/using-this-repo/SKILL.md` § "Plan-writing conventions", tasks specify signatures, acceptance criteria, and affected files — **not** verbatim implementation bodies. The impl agent reconciles against installed deps and the type-checker.

**Spec:** `docs/specs/2026-05-20-grounding-judge-redesign.md`

**Goal:** Replace the broken `llm-rubric` in `suites/url-grounding/` with a custom JS-typed assertion that reads `document.text` from `ProviderResponse.metadata` and grades via `claude-sonnet-4-6` at threshold 0.7, backed by a hand-labeled gold set + Cohen's κ calibration script.

**Architecture:** Provider attaches `metadata.document` on success. A pure judge-core function (parameterised on model) builds the prompt, calls Anthropic with `temperature: 0`, parses `{pass, score, reason}`, and enforces the 0.7 threshold. A thin assertion adapter routes promptfoo's `AssertionValueFunctionContext` into the core. A calibration script exercises the same core against a 10-row JSONL gold set and computes Cohen's κ with an exit-code-1 escalation rule at κ < 0.6.

**Tech Stack:** TypeScript, Bun, vitest, promptfoo `0.121.11`, AI SDK `ai@6.0.184`, `@ai-sdk/anthropic@3.0.78` (already on `packages/evals`), Anthropic `claude-sonnet-4-6`.

---

## File structure

| File | Intent | Responsibility |
|---|---|---|
| `packages/evals/src/providers/agent-provider.ts` | modify | Attach `metadata.document = { text, title, sourceUrl }` on success path. |
| `packages/evals/src/judges/grounding-judge-core.ts` | create | Pure: `gradeGrounding(input): Promise<Verdict>`. Owns prompt, Anthropic call, parsing, threshold. |
| `packages/evals/src/asserts/grounding-judge.ts` | create | Thin adapter — reads `AssertionValueFunctionContext`, calls core, returns `GradingResult`. |
| `packages/evals/src/calibrate-judge.ts` | create | Bun script — loads gold set, calls core, computes Cohen's κ, writes snapshot. |
| `packages/evals/judges/grounding-gold.jsonl` | create | 10 hand-crafted rows (5 known-good, 5 known-bad). Fixture, not test data. |
| `packages/evals/tests/agent-provider.test.ts` | modify | Add assertion that successful `callApi` returns `metadata.document`. |
| `packages/evals/tests/grounding-judge-core.test.ts` | create | Unit tests with mocked `@ai-sdk/anthropic`. |
| `packages/evals/tests/grounding-judge.test.ts` | create | Unit tests for the assertion adapter. |
| `packages/evals/suites/url-grounding/promptfooconfig.yaml` | modify | Swap `llm-rubric` for `type: javascript`, drop `defaultTest.options.provider`. |
| `docs/evals/grounding-judge-calibration-<YYYY-MM-DD>.md` | create (auto) | Calibration snapshot from Task 7. |
| `docs/evals/url-grounding-<YYYY-MM-DD>.md` | create (auto, overwrite) | New suite snapshot from Task 7. |

---

## Library reference (verified against installed types — apply as written)

### promptfoo `AssertionValueFunctionContext`

Exported from `'promptfoo'` root. Shape (from `node_modules/.bun/promptfoo@0.121.11/.../dist/src/index.d.ts:2853`):

```ts
interface AssertionValueFunctionContext {
  prompt: string | undefined;
  vars: Record<string, VarValue>;
  test: AtomicTestCase;
  logProbs: number[] | undefined;
  config?: Record<string, any>;
  provider: ApiProvider | undefined;
  providerResponse: ProviderResponse | undefined;   // <- the integration point
  trace?: TraceData;
}
```

`ProviderResponse.metadata` is open-ended `Record<string, any>` with one optional documented field (`http`). Stuffing `{ document: { text, title, sourceUrl } }` is type-safe.

The JS assertion file must default-export an async function `(output, context) => GradingResult`. promptfoo's loader unwraps `default` first; named exports also work if needed.

### AI SDK v6 `generateText` (non-streaming)

Exported from `'ai'`. Sibling of `streamText` already used in `packages/agent/src/agent.ts`. Shape (from `node_modules/.bun/ai@6.0.184/.../dist/index.d.ts`):

```ts
function generateText(options: {
  model: LanguageModel;
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  temperature?: number;
  // …
}): Promise<{ text: string; usage; finishReason; /* … */ }>;
```

For `claude-sonnet-4-6`: `import { anthropic } from '@ai-sdk/anthropic'; const model = anthropic('claude-sonnet-4-6');`.

`temperature: 0` is documented — important for judge determinism.

**Verify against `node_modules/.bun/ai@6.0.184/.../dist/index.d.ts` before pasting the call site** — the API may have a `prompt: string` shorthand or require `messages: [{ role, content }]`. Either works; pick what reads cleanest.

---

## Task 1: Provider attaches `metadata.document` on success

**Files:**
- Modify: `packages/evals/src/providers/agent-provider.ts`
- Modify: `packages/evals/tests/agent-provider.test.ts`

**Behavior to add:**

On the existing success path (after `streamChat` drain), the return changes from `{ output: text }` to:

```ts
return {
  output: text,
  metadata: {
    document: {
      text: extractResult.text,
      title: extractResult.title,
      sourceUrl: fetchResult.value.finalUrl,
    },
  },
};
```

Failure paths (`{ error: ... }`) are untouched — no `metadata`.

- [ ] **Step 1: Add the failing test**

In `agent-provider.test.ts`, add a new test asserting that a successful `callApi` (mocked `safeFetch`, `extractContent`, `streamChat`) returns a `ProviderResponse` whose `metadata.document` equals `{ text: 'doc text', title: 'T', sourceUrl: <finalUrl from mocked safeFetch> }`. Keep all existing 9 assertions intact.

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: 9 pass, 1 fail (the new metadata assertion).

- [ ] **Step 3: Implement**

Modify the success-path return in `agent-provider.ts` per the shape above.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: 10 pass.

- [ ] **Step 5: Type-check + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add packages/evals/src/providers/agent-provider.ts packages/evals/tests/agent-provider.test.ts
git commit -m "feat(evals): agent-provider attaches document on response metadata"
```

---

## Task 2: Judge core — `grounding-judge-core.ts`

**Files:**
- Create: `packages/evals/src/judges/grounding-judge-core.ts`
- Create: `packages/evals/tests/grounding-judge-core.test.ts`

**Module contract:**

```ts
export interface GradingInput {
  question: string;
  output: string;
  document: { text: string; title: string; sourceUrl: string };
  judgeModel?: string;          // defaults to 'claude-sonnet-4-6'
}

export interface Verdict {
  pass: boolean;
  score: number;                 // 0..1
  reason: string;                // one sentence
  raw: string;                   // raw judge response text — for debugging
}

export const JUDGE_PASS_THRESHOLD = 0.7;
export const JUDGE_DEFAULT_MODEL = 'claude-sonnet-4-6';
export const JUDGE_SYSTEM: string;  // see spec § "Judge prompt"

export async function gradeGrounding(input: GradingInput): Promise<Verdict>;
```

**Library calls:**

- `generateText` from `'ai'` (verify the exact call shape against installed types per Library reference above).
- `anthropic('claude-sonnet-4-6')` from `'@ai-sdk/anthropic'`.
- `temperature: 0`.

**Behavior:**

1. Build the user prompt by concatenating question, output, and document fields (see spec § "Judge prompt" for the literal template).
2. Call `generateText({ model, system: JUDGE_SYSTEM, prompt: <user prompt>, temperature: 0 })`.
3. Parse the response `text` as JSON. The judge is instructed to return a single-line object with no markdown fences.
4. If parsing fails OR the parsed object is missing `score` OR `score` is not a finite number in `[0, 1]`, return `{ pass: false, score: 0, reason: 'judge returned malformed JSON or out-of-range score', raw: <text> }`.
5. Otherwise return `{ pass: score >= JUDGE_PASS_THRESHOLD, score, reason: <parsed reason or '' if missing>, raw: <text> }`.
   - The assertion's `pass` ignores the judge's claimed `pass` and uses the threshold check.

- [ ] **Step 1: Write the failing tests**

In `grounding-judge-core.test.ts`, mock `'ai'` so `generateText` is `vi.mocked`. Add 5 tests:

A. **Happy path** — `generateText` returns `text: '{"pass": true, "score": 0.85, "reason": "well-grounded"}'`. Assert returned `Verdict` is `{ pass: true, score: 0.85, reason: 'well-grounded', raw: ... }`.

B. **Threshold override** — `generateText` returns `text: '{"pass": true, "score": 0.5, "reason": "borderline"}'`. Even though judge claims `pass: true`, returned `pass` MUST be `false` (because 0.5 < 0.7).

C. **Malformed JSON** — `generateText` returns `text: 'sorry, I cannot answer'`. Returned `Verdict.pass === false`, `score === 0`, `reason` contains `'malformed'` or `'JSON'`.

D. **Score out of range** — `generateText` returns `text: '{"pass": true, "score": 1.5, "reason": "x"}'`. Same fail-shape as case C.

E. **Custom judge model** — call `gradeGrounding({ ..., judgeModel: 'claude-opus-4-7' })`. Assert `anthropic` is called with `'claude-opus-4-7'` via `vi.mocked(anthropic).mock.calls[0][0]`.

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/evals/tests/grounding-judge-core.test.ts`
Expected: 5 FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement `grounding-judge-core.ts`**

Implement per the contract above. Constants (`JUDGE_PASS_THRESHOLD`, `JUDGE_DEFAULT_MODEL`, `JUDGE_SYSTEM`) are exported so the calibration script and any future caller can introspect them. `JUDGE_SYSTEM` is the literal string from spec § "Judge prompt".

The user-prompt builder is a private helper inside the module — do not export it.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/evals/tests/grounding-judge-core.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Type-check + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add packages/evals/src/judges/grounding-judge-core.ts packages/evals/tests/grounding-judge-core.test.ts
git commit -m "feat(evals): grounding-judge-core grades with document context"
```

---

## Task 3: Assertion adapter — `grounding-judge.ts`

**Files:**
- Create: `packages/evals/src/asserts/grounding-judge.ts`
- Create: `packages/evals/tests/grounding-judge.test.ts`

**Module contract:**

```ts
import type { AssertionValueFunctionContext, GradingResult } from 'promptfoo';
import { gradeGrounding } from '../judges/grounding-judge-core';

export default async function gradeGroundingAssertion(
  output: string,
  context: AssertionValueFunctionContext,
): Promise<GradingResult>;
```

`GradingResult` from `'promptfoo'` has at minimum `{ pass: boolean; score?: number; reason?: string }`.

**Behavior:**

1. Read `context.providerResponse?.metadata?.document`. Required fields: `text` (non-empty string), `title` (string, can be empty), `sourceUrl` (non-empty string).
   - If `document` missing or any required field missing/wrong type: return `{ pass: false, score: 0, reason: 'no document attached to provider response' }`.
2. Read `context.vars?.question`. Must be `string`.
   - If missing/non-string: return `{ pass: false, score: 0, reason: 'no question in context.vars' }`.
3. Call `gradeGrounding({ question, output, document })`.
4. Map the returned `Verdict` to `GradingResult`: `{ pass: v.pass, score: v.score, reason: v.reason }`. Drop `raw` (not part of `GradingResult`).

- [ ] **Step 1: Write the failing tests**

In `grounding-judge.test.ts`, mock the core module: `vi.mock('../src/judges/grounding-judge-core', ...)`. Add 4 tests:

A. **Happy path** — mocked `gradeGrounding` returns `{ pass: true, score: 0.9, reason: 'g', raw: '' }`. Call assertion with `output: 'agent text'`, `context: { vars: { question: 'q' }, providerResponse: { metadata: { document: { text: 'doc', title: 't', sourceUrl: 'https://e/' } } } }`. Assert returns `{ pass: true, score: 0.9, reason: 'g' }`.

B. **Missing document** — call with `providerResponse: { metadata: {} }` (or no `providerResponse` at all). Assert `{ pass: false, score: 0, reason: /no document/i }`. Assert `gradeGrounding` NOT called.

C. **Missing question** — call with valid `providerResponse.metadata.document` but `context.vars: {}`. Assert `{ pass: false, score: 0, reason: /no question/i }`. Assert `gradeGrounding` NOT called.

D. **Document text empty** — `document.text: ''`. Assert `{ pass: false, score: 0, reason: /no document/i }`.

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/evals/tests/grounding-judge.test.ts`
Expected: 4 FAIL.

- [ ] **Step 3: Implement `grounding-judge.ts`**

Implement per the contract. Keep the file under ~40 lines — this is a thin adapter, not a place for logic.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/evals/tests/grounding-judge.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Run the full evals test suite**

Run: `bunx vitest run packages/evals/tests/`
Expected: 14 pass total (10 from Task 1, 5 from Task 2 — wait, that's 15; recount: Task 1 lands with 10, Task 2 lands with 5, Task 3 with 4 → 19 assertions across the 3 files).

If the count is off, debug — don't proceed.

- [ ] **Step 6: Type-check + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add packages/evals/src/asserts/grounding-judge.ts packages/evals/tests/grounding-judge.test.ts
git commit -m "feat(evals): grounding-judge assertion adapter"
```

---

## Task 4: Gold set — `grounding-gold.jsonl`

**Files:**
- Create: `packages/evals/judges/grounding-gold.jsonl`

**Row schema (each line one JSON object):**

```jsonc
{
  "description": "string — what this row exercises",
  "question": "string",
  "output": "string — what an agent might have answered",
  "document": {
    "text": "string — full text the judge will see",
    "title": "string",
    "sourceUrl": "string (URL)"
  },
  "humanVerdict": "pass" | "fail",
  "humanReason": "string — one sentence rationale"
}
```

**Row plan (10 rows total — 5 known-good + 5 known-bad):**

For document text, capture once at authoring time by running a tiny script (or `curl + node -e`) against each KB URL and pasting the extracted text. Same Readability extraction we use at runtime; the test fixture should reflect what the agent actually sees.

| # | Class | Document source | Failure mode covered |
|---|---|---|---|
| 1 | known-good (pass) | RFC 2324 (rfc-editor.org/rfc/rfc2324.html) | Correct claim, valid Lxx citing supporting text |
| 2 | known-good (pass) | RFC 2324 | Correct claim with multiple Lxx citations |
| 3 | known-good (pass) | Wikipedia HTCPCP | Brief but grounded answer |
| 4 | known-good (pass) | Wikipedia HTTP 418 | Correct claim about a stable historical fact |
| 5 | known-good (pass) | RFC 7168 | Longer answer (3+ sentences) with multiple citations |
| 6 | known-bad (fail) | RFC 2324 | Fabricated fact not in document |
| 7 | known-bad (fail) | RFC 2324 | Citation to real line that doesn't support the claim |
| 8 | known-bad (fail) | Wikipedia HTCPCP | Citation to non-existent line (e.g. L9999) |
| 9 | known-bad (fail) | Wikipedia HTTP 418 | Missing citation entirely |
| 10 | known-bad (fail) | RFC 7168 | Mismatched paraphrase — drift beyond what doc says |

- [ ] **Step 1: Capture document text for each KB URL**

A one-shot Bun script you write under `/tmp/`:

```ts
// /tmp/capture.ts
import { safeFetch, extractContent } from '@url-cheat-sheet/agent';
const url = process.argv[2];
const r = await safeFetch(url);
if (!r.ok) { console.error(r.error); process.exit(1); }
const e = extractContent(r.value.html, r.value.finalUrl);
if ('kind' in e) { console.error(e.kind); process.exit(1); }
console.log(JSON.stringify({ text: e.text, title: e.title, sourceUrl: r.value.finalUrl }));
```

Run for each URL: `bun /tmp/capture.ts <url> > /tmp/<slug>.json`. **Note:** RFC 7168 may produce empty/short extraction (the known issue from `ucs-6gd`). Use whatever text comes out — including the empty case for row 5. If the empty case makes row 5 unworkable as known-good, swap row 5's URL to RFC 2324 or Wikipedia, and add a separate edge-case row.

- [ ] **Step 2: Author the 10 rows**

Construct each row's `output` as plausible agent text. For known-good rows: ground each citation in the captured `document.text`. For known-bad rows: each should fail in exactly the way the table describes — clean, isolated failure modes, not multi-failure soup.

Write to `packages/evals/judges/grounding-gold.jsonl` as JSON Lines (one object per line, no trailing newline rules — just LF line endings).

- [ ] **Step 3: Validate the file parses**

Run: `bun -e 'for (const l of require("node:fs").readFileSync("packages/evals/judges/grounding-gold.jsonl","utf8").trim().split("\n")) JSON.parse(l)' && echo OK`
Expected: `OK`.

Also confirm exactly 10 lines:
Run: `wc -l < packages/evals/judges/grounding-gold.jsonl`
Expected: `10`.

- [ ] **Step 4: Commit**

```bash
git add packages/evals/judges/grounding-gold.jsonl
git commit -m "test(evals): hand-labeled grounding-judge gold set (10 rows)"
```

---

## Task 5: Calibration script — `calibrate-judge.ts`

**Files:**
- Create: `packages/evals/src/calibrate-judge.ts`

**Contract:**

Bun script. No exports. Reads `packages/evals/judges/grounding-gold.jsonl`. For each row calls `gradeGrounding({ question, output, document })` from `grounding-judge-core.ts`. Compares judge's `pass` to `humanVerdict`. Computes:

- Confusion matrix: TP/TN/FP/FN counts.
- Cohen's κ: standard formula
  - `po = (TP + TN) / N`
  - `pe = ((TP+FN)*(TP+FP) + (TN+FP)*(TN+FN)) / N^2`
  - `κ = (po - pe) / (1 - pe)`

Writes a snapshot to `docs/evals/grounding-judge-calibration-<YYYY-MM-DD>.md` containing:
- Header with date + judge model used.
- Confusion matrix as a markdown table.
- κ value.
- Per-example list: `[row#] description — judge pass=X (score Y) vs human pass=Z — agree/MISMATCH — judge reason: "…"`.
- A bold "ESCALATE: κ < 0.6" or "PASS: κ >= 0.6" line at the end.

Prints the same summary to stdout. Exit code:
- 0 if κ >= 0.6
- 1 if κ < 0.6
- 2 if the gold set is malformed or unreadable

**No tests for this script.** The script's correctness is observable through Task 7's live calibration run.

- [ ] **Step 1: Implement the script**

Use `node:fs/promises` (`readFile`, `mkdir`, `writeFile`). Compute the date with `new Date().toISOString().slice(0,10)`. Cohen's κ formula above — implement inline, no library.

- [ ] **Step 2: Type-check + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 3: Smoke-test against an empty (or 1-row) gold file**

Temporarily replace `grounding-gold.jsonl` with a 2-row sanity set (one known-good, one known-bad both with `humanVerdict: 'pass'` to force a known outcome shape), run `bun packages/evals/src/calibrate-judge.ts`, confirm it produces a snapshot and exits without crashing. Restore the real gold set after.

(Or skip this step and rely on Task 7 — judgment call by the impl agent.)

- [ ] **Step 4: Commit**

```bash
git add packages/evals/src/calibrate-judge.ts
git commit -m "feat(evals): calibrate-judge script with Cohen's κ + snapshot"
```

---

## Task 6: Wire the new assertion in the suite YAML

**Files:**
- Modify: `packages/evals/suites/url-grounding/promptfooconfig.yaml`

**Changes:**

In `defaultTest.assert`:
- KEEP: `{ type: regex, value: 'L\d+' }`.
- REPLACE: the `{ type: llm-rubric, value: ... }` block with:
  ```yaml
  - type: javascript
    value: 'file://../../src/asserts/grounding-judge.ts'
  ```

In `defaultTest`:
- REMOVE: the `options.provider:` block (no `llm-rubric` left to grade).

The 5 test entries and their per-test `contains` assertions stay unchanged.

- [ ] **Step 1: Apply the YAML change**

Edit `promptfooconfig.yaml` per the above. Re-run `bun run lint` if prettier touches YAML (it does in this repo's config).

- [ ] **Step 2: Type-check + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add packages/evals/suites/url-grounding/promptfooconfig.yaml
git commit -m "feat(evals): url-grounding suite uses custom grounding-judge assertion"
```

---

## Task 7: Live calibration + live suite re-run

**Files:**
- Create (auto): `docs/evals/grounding-judge-calibration-<YYYY-MM-DD>.md`
- Create/overwrite (auto): `docs/evals/url-grounding-<YYYY-MM-DD>.md`

**Pre-flight:** `ANTHROPIC_API_KEY` must be set in `.env`. Per CLAUDE.md "Always do first" item 5: if `.env` is missing, **stop and ask the user** — do not modify `.env`.

- [ ] **Step 1: Confirm `.env` has the key**

Run: `test -s .env && grep -q '^ANTHROPIC_API_KEY=' .env && echo OK || echo MISSING`
Expected: `OK`. If `MISSING`, stop and ask the user.

- [ ] **Step 2: Run calibration**

Run: `bun packages/evals/src/calibrate-judge.ts`
Expected: exits 0. Snapshot file at `docs/evals/grounding-judge-calibration-<today>.md` containing κ and confusion matrix. **κ must be >= 0.6.**

If κ < 0.6 (exit 1), do NOT proceed. Stop and report: the gold set may need refinement OR the judge model needs to escalate to Opus per the spec's rule. Do not silently lower the threshold. Surface this to the orchestrator — it's a real signal.

- [ ] **Step 3: Run the suite**

Run: `bun packages/evals/src/run.ts url-grounding`
Expected: exits 0 or 100 (per Task 6 of the prior plan, exit 100 = some tests failed, still snapshot-worthy). New snapshot at `docs/evals/url-grounding-<today>.md`. The snapshot's per-test `reason` fields should NO LONGER contain "I cannot verify" or similar hedges — the judge has document context now.

- [ ] **Step 4: Inspect the new suite snapshot**

Confirm:
- All 5 test entries appear.
- LLM-rubric/javascript assertion results have substantive reasons (not "without access to the document").
- Pass/fail mix is honest — do NOT loosen the suite to make it pass.

If the suite now produces some passes where it produced 0/5 before, that's the improvement we shipped. If it still produces 0/5 but with substantive reasons (e.g. "agent fabricated fact, line L42 actually says X"), that's also a win — it's the suite correctly identifying real agent issues.

- [ ] **Step 5: Commit both snapshots**

```bash
git add docs/evals/grounding-judge-calibration-*.md docs/evals/url-grounding-*.md
git commit -m "test(evals): first calibration snapshot + re-run with document-aware judge"
```

In the commit body, include: the κ value, the new suite pass-rate, and one line summarising what the new reasons look like compared to the prior "I cannot verify" hedges.

- [ ] **Step 6: Push**

```bash
git push
```

---

## Self-review

### Spec coverage

| Spec section | Task |
|---|---|
| Provider attaches metadata.document | Task 1 |
| Judge core (prompt, anthropic call, threshold, parsing) | Task 2 |
| Assertion adapter | Task 3 |
| Gold set (10 rows, 5 good + 5 bad) | Task 4 |
| Calibration script (κ + snapshot + exit codes) | Task 5 |
| YAML wire-up (javascript assertion, drop options.provider) | Task 6 |
| Live calibration (κ ≥ 0.6 acceptance) | Task 7 |
| Live suite re-run (non-hedging reasons) | Task 7 |
| Unit tests for prompt/parse/threshold/metadata-missing/question-missing | Tasks 2 + 3 |

No gaps.

### Placeholder scan

- No `TBD` / `TODO` / `implement later` strings in the plan body.
- Task 4 Step 3 leaves the choice of "smoke-test or skip" to the impl agent — this is a real judgment call (the script's correctness is fully exercised by Task 7), not a placeholder. Acceptable.
- Task 4 Step 1's RFC 7168 swap clause is explicit about WHEN to swap and WHERE to put the new row. Not a placeholder.

### Type consistency

- `Verdict` shape (`pass, score, reason, raw`) used identically in Tasks 2, 3, 5.
- `GradingInput` shape (`question, output, document, judgeModel?`) consistent across Tasks 2 + 3 + 5.
- `document` shape (`{ text, title, sourceUrl }`) consistent across Tasks 1, 3, 4.
- `JUDGE_PASS_THRESHOLD = 0.7` referenced in Task 2 (implementation) and validated in Task 7 Step 4 (where pass-rate is observed, not the threshold itself).
- Test count: Task 1 adds 1 → 10 total. Task 2 adds 5 in its own file → 15 across two files. Task 3 adds 4 in its own file → 19 across three files. Task 3 Step 5 says "19 assertions across the 3 files" — consistent.
