<!-- v2 - 2026-05-20 - Generated via improving-plans from docs/plans/2026-05-20-grounding-judge-redesign.md -->

# Grounding Judge Redesign — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan-writing convention for this repo:** Per `.claude/skills/using-this-repo/SKILL.md` § "Plan-writing conventions", tasks specify signatures, acceptance criteria, and affected files — **not** verbatim implementation bodies. The impl agent reconciles against installed deps and the type-checker.
>
> **Changes from v1:** JSON parsing in Task 2 adds lightweight `{...}` extraction before `JSON.parse`. Task 5 adds Cohen's κ degenerate-case guard. Task 4 relocates the capture script from `/tmp/` to `packages/evals/scripts/` so workspace imports resolve. Task 5 makes "calibration uses embedded text, never re-fetches" explicit. Task 7 gains a cost note. Test-count narration cleaned up. See `docs/reviews/2026-05-20-grounding-judge-redesign-v1-review-report.md` for the review details.

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
| `packages/evals/scripts/capture-doc.ts` | create (throwaway) | One-shot doc-text capture for gold-set authoring. Deleted after Task 4 completes; not committed. |
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

The JS assertion file must default-export an async function `(output, context) => GradingResult`. promptfoo's loader strips `file://` (two slashes — verified at `evaluator-DbOsHSRe.js:4629`), then `path.resolve(state.basePath, ...)` against the YAML config directory. Same footgun as the provider: one-slash `file:` is silently broken. Use `file://../../src/asserts/grounding-judge.ts` from `suites/url-grounding/`.

### AI SDK v6 `generateText` (verified)

Imported from `'ai'`. Sibling of `streamText` already used in `packages/agent/src/agent.ts`.

Verified shape (from `node_modules/.bun/ai@6.0.184/.../dist/index.d.ts:1348`):

- Options type is an inline intersection `CallSettings & Prompt & { model, … }`. No exported `GenerateTextOptions` name.
- Only `model` is required.
- `Prompt` is a discriminated union: `{ prompt: string | Array<ModelMessage>; messages?: never }` OR `{ messages: Array<ModelMessage>; prompt?: never }`. **Prefer `prompt: <user prompt string>` — the type accepts it.** `system?: string` is shared.
- `temperature: 0` is accepted (`CallSettings.temperature?: number`, no `> 0` constraint).
- Result: `.text` is direct on the returned `GenerateTextResult` (no nested wrapper).

For the judge model: `import { anthropic } from '@ai-sdk/anthropic'; const model = anthropic('claude-sonnet-4-6');`.

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

- `generateText` from `'ai'` — call shape: `{ model, system: JUDGE_SYSTEM, prompt: <userPrompt>, temperature: 0 }`. Result: `.text` directly.
- `anthropic('claude-sonnet-4-6')` from `'@ai-sdk/anthropic'`.

**Behavior:**

1. Build the user prompt by concatenating question, output, and document fields (see spec § "Judge prompt" for the literal template).
2. Call `generateText({ model: anthropic(input.judgeModel ?? JUDGE_DEFAULT_MODEL), system: JUDGE_SYSTEM, prompt: userPrompt, temperature: 0 })`.
3. **Lightweight JSON extraction before parsing:** extract the first `{...}` substring from the response text using `text.match(/\{[\s\S]*\}/)?.[0] ?? text`. Then call `JSON.parse` on that substring. This catches Sonnet's occasional prose-prefix or markdown-fenced output without sacrificing strictness.
4. If extraction returns nothing OR `JSON.parse` throws OR the parsed object is missing `score` OR `score` is not a finite number in `[0, 1]`, return `{ pass: false, score: 0, reason: 'judge returned malformed JSON or out-of-range score', raw: <full original text> }`.
5. Otherwise return `{ pass: score >= JUDGE_PASS_THRESHOLD, score, reason: <parsed reason or '' if missing>, raw: <full original text> }`.
   - The assertion's `pass` ignores the judge's self-claimed `pass` and uses the threshold check.

- [ ] **Step 1: Write the failing tests**

In `grounding-judge-core.test.ts`, mock `'ai'` so `generateText` is `vi.mocked`. Add 6 tests:

A. **Happy path** — `generateText` returns `text: '{"pass": true, "score": 0.85, "reason": "well-grounded"}'`. Assert returned `Verdict` is `{ pass: true, score: 0.85, reason: 'well-grounded', raw: <text> }`.

B. **Threshold override** — `generateText` returns `text: '{"pass": true, "score": 0.5, "reason": "borderline"}'`. Even though judge claims `pass: true`, returned `pass` MUST be `false` (because 0.5 < 0.7).

C. **Malformed (no JSON at all)** — `generateText` returns `text: 'sorry, I cannot answer'`. Returned `Verdict.pass === false`, `score === 0`, `reason` contains `'malformed'` or `'JSON'`.

D. **Score out of range** — `generateText` returns `text: '{"pass": true, "score": 1.5, "reason": "x"}'`. Same fail-shape as case C.

E. **Custom judge model** — call `gradeGrounding({ ..., judgeModel: 'claude-opus-4-7' })`. Assert `anthropic` is called with `'claude-opus-4-7'` via `vi.mocked(anthropic).mock.calls[0][0]`.

F. **Prose-prefixed JSON (extraction test)** — `generateText` returns `text: 'Here is the verdict:\n```json\n{"pass": true, "score": 0.8, "reason": "ok"}\n```'`. Returned `Verdict` is `{ pass: true, score: 0.8, reason: 'ok', raw: <full text including the markdown fences> }`. This pins the extraction layer.

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/evals/tests/grounding-judge-core.test.ts`
Expected: 6 FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement `grounding-judge-core.ts`**

Implement per the contract above. Constants (`JUDGE_PASS_THRESHOLD`, `JUDGE_DEFAULT_MODEL`, `JUDGE_SYSTEM`) are exported so the calibration script and any future caller can introspect them. `JUDGE_SYSTEM` is the literal string from spec § "Judge prompt".

The user-prompt builder and the JSON-extraction helper are private functions inside the module — do not export them.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/evals/tests/grounding-judge-core.test.ts`
Expected: 6 PASS.

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
Expected: **20 assertions total across the 3 files** — 10 (`agent-provider.test.ts` after Task 1) + 6 (`grounding-judge-core.test.ts` after Task 2) + 4 (`grounding-judge.test.ts` after Task 3) = 20.

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
- Create (throwaway): `packages/evals/scripts/capture-doc.ts`
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

For document text, capture once at authoring time using a small script LOCATED IN THE WORKSPACE (so workspace imports resolve), then paste into the JSONL. Same Readability extraction we use at runtime; the fixture should reflect what the agent actually sees.

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

- [ ] **Step 1: Author and run the capture script**

Create `packages/evals/scripts/capture-doc.ts` as a tiny throwaway. It uses the workspace-resolved `@url-cheat-sheet/agent` (which is why it must live in-package, not in `/tmp/`):

```ts
import { safeFetch, extractContent } from '@url-cheat-sheet/agent';
const url = process.argv[2];
if (!url) { console.error('usage: capture-doc.ts <url>'); process.exit(2); }
const r = await safeFetch(url);
if (!r.ok) { console.error(JSON.stringify(r.error)); process.exit(1); }
const e = extractContent(r.value.html, r.value.finalUrl);
if ('kind' in e) { console.error(e.kind); process.exit(1); }
console.log(JSON.stringify({ text: e.text, title: e.title, sourceUrl: r.value.finalUrl }));
```

Run for each URL:
```bash
bun packages/evals/scripts/capture-doc.ts https://www.rfc-editor.org/rfc/rfc2324.html > /tmp/rfc2324.json
bun packages/evals/scripts/capture-doc.ts https://www.rfc-editor.org/rfc/rfc7168.html > /tmp/rfc7168.json
bun packages/evals/scripts/capture-doc.ts https://en.wikipedia.org/wiki/Hyper_Text_Coffee_Pot_Control_Protocol > /tmp/htcpcp.json
bun packages/evals/scripts/capture-doc.ts https://en.wikipedia.org/wiki/HTTP_418 > /tmp/http418.json
```

**Known issue:** RFC 7168 may produce empty/short extraction (the `ucs-6gd` bug). If it does, swap row 5's URL to one of the other four sources (and add a known-bad row for the empty-doc edge case to a different row's slot — e.g. swap row 10's text to use the empty-extracted RFC 7168 doc, asserting the judge correctly returns `fail` with reason "document has no extractable text").

- [ ] **Step 2: Author the 10 rows**

Construct each row's `output` as plausible agent text. For known-good rows: ground each citation in the captured `document.text` (count newlines to pick real line numbers — `awk 'NR==42' /tmp/rfc2324.json | jq -r .text` style). For known-bad rows: each should fail in exactly the way the table describes — clean, isolated failure modes, not multi-failure soup.

Write to `packages/evals/judges/grounding-gold.jsonl` as JSON Lines (one object per line, LF line endings).

**Important:** the calibration script (Task 5) uses the EMBEDDED `document.text` from the gold set, NEVER re-fetches the URL. The gold set is a fixed-input test of the judge; URL drift over time would silently change the test, defeating its purpose.

- [ ] **Step 3: Validate the file parses**

Run: `bun -e 'for (const l of require("node:fs").readFileSync("packages/evals/judges/grounding-gold.jsonl","utf8").trim().split("\n")) JSON.parse(l)' && echo OK`
Expected: `OK`.

Also confirm exactly 10 lines:
Run: `wc -l < packages/evals/judges/grounding-gold.jsonl`
Expected: `10`.

- [ ] **Step 4: Delete the capture script**

It served its purpose; not worth committing as a permanent artifact. Either `git rm packages/evals/scripts/capture-doc.ts` (if accidentally staged) or simply don't `git add` it. If `packages/evals/scripts/` is now empty, leave it — nothing to clean up.

- [ ] **Step 5: Commit**

```bash
git add packages/evals/judges/grounding-gold.jsonl
git commit -m "test(evals): hand-labeled grounding-judge gold set (10 rows)"
```

---

## Task 5: Calibration script — `calibrate-judge.ts`

**Files:**
- Create: `packages/evals/src/calibrate-judge.ts`

**Contract:**

Bun script. No exports. Reads `packages/evals/judges/grounding-gold.jsonl`. For each row calls `gradeGrounding({ question, output, document })` from `grounding-judge-core.ts` — passing the EMBEDDED `document.text`, NEVER re-fetching the URL.

Computes:

- Confusion matrix: TP/TN/FP/FN counts (TP = judge says pass + human says pass; etc.).
- Cohen's κ: standard formula
  - `po = (TP + TN) / N`
  - `pe = ((TP+FN)*(TP+FP) + (TN+FP)*(TN+FN)) / N^2`
  - `κ = (po - pe) / (1 - pe)`

**Degenerate-case guard:** if `pe >= 1 - 1e-9` (e.g. all 10 rows have the same `humanVerdict` AND the judge agrees on all of them — chance agreement is 100%, formula denominator is 0), report κ as:
- `1.0` if `po == 1` (perfect agreement, no signal from κ but not wrong)
- `0.0` otherwise (judge fully disagreed with a single-class set — κ undefined, treat as failure)

Log the degenerate case explicitly in the snapshot so the reader knows κ is uninformative there. Practically this won't fire on a healthy 5-good + 5-bad set.

Writes a snapshot to `docs/evals/grounding-judge-calibration-<YYYY-MM-DD>.md` containing:
- Header with date + judge model used.
- Confusion matrix as a markdown table.
- κ value (and a degenerate-case note if applicable).
- Per-example list: `[row#] description — judge pass=X (score Y) vs human pass=Z — agree/MISMATCH — judge reason: "…"`.
- A bold "ESCALATE: κ < 0.6" or "PASS: κ >= 0.6" line at the end.

Prints the same summary to stdout. Exit code:
- 0 if κ >= 0.6
- 1 if κ < 0.6
- 2 if the gold set is malformed or unreadable

**No tests for this script.** The script's correctness is observable through Task 7's live calibration run.

- [ ] **Step 1: Implement the script**

Use `node:fs/promises` (`readFile`, `mkdir`, `writeFile`). Compute the date with `new Date().toISOString().slice(0,10)`. Cohen's κ formula above — implement inline, no library. Include the degenerate-case guard.

- [ ] **Step 2: Type-check + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 3: Commit**

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

**Cost note:** This task makes real Anthropic calls. Rough estimate:
- Calibration: 10 sonnet judge calls × (~15K input + 150 output) ≈ **$0.50**.
- Suite re-run: 5 agent calls (sonnet, streaming with grep tool) + 5 sonnet judge calls ≈ **$0.50**.
- Total: **~$1 per Task 7 run**.

If the impl agent retries calibration 2-3 times (rubric tuning, threshold tweaking), expect $2-3. If something fundamentally wrong drives more than 5 retries, **stop and escalate** rather than churning spend.

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
Expected: exits 0 or 100 (per the prior plan, exit 100 = some tests failed, still snapshot-worthy). New snapshot at `docs/evals/url-grounding-<today>.md`. The snapshot's per-test `reason` fields should NO LONGER contain "I cannot verify" or similar hedges — the judge has document context now.

- [ ] **Step 4: Inspect the new suite snapshot**

Confirm:
- All 5 test entries appear.
- The javascript-assertion results have substantive reasons (not "without access to the document").
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
| Calibration script (κ + snapshot + exit codes + degenerate-case guard) | Task 5 |
| YAML wire-up (javascript assertion, drop options.provider) | Task 6 |
| Live calibration (κ ≥ 0.6 acceptance) | Task 7 |
| Live suite re-run (non-hedging reasons) | Task 7 |
| Unit tests for prompt/parse/threshold/metadata-missing/question-missing | Tasks 2 + 3 |
| JSON extraction robustness | Task 2 (case F + step 3 logic) |

No gaps.

### Placeholder scan

- No `TBD` / `TODO` / `implement later` strings in the plan body.
- Task 4 Step 1's RFC 7168 swap clause is explicit about WHEN to swap and WHERE to put the new row — not a placeholder, a documented contingency.

### Type consistency

- `Verdict` shape (`pass, score, reason, raw`) used identically in Tasks 2, 3, 5.
- `GradingInput` shape (`question, output, document, judgeModel?`) consistent across Tasks 2 + 3 + 5.
- `document` shape (`{ text, title, sourceUrl }`) consistent across Tasks 1, 3, 4.
- `JUDGE_PASS_THRESHOLD = 0.7` referenced in Task 2 (implementation) and validated in Task 7 Step 4 (pass-rate observation).
- Test count: Task 1 adds 1 → 10 total in `agent-provider.test.ts`. Task 2 creates a new file with 6 tests. Task 3 creates a new file with 4 tests. Total across 3 files = 10 + 6 + 4 = **20 assertions**, matching Task 3 Step 5.
