# Agent Navigation Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the design in [`../specs/2026-05-20-agent-navigation-tools.md`](../specs/2026-05-20-agent-navigation-tools.md) — give the agent two navigation tools (`outline()`, `read_lines()`) so it can confirm an off-topic question is genuinely off-topic before refusing, instead of fabricating content (calibration rows 6 and 10).

**Architecture:** Sidecar pass on `extract.ts` attaches heading line numbers to the existing `Document` without touching `textContent` byte-for-byte (line numbers are load-bearing for every existing `Lxx` citation). Two new tools — `outline()` and `read_lines(start, end)` — close over the loaded `Document`. System prompt teaches a fallback ladder: grep → outline → read_lines → grounded refusal naming what the doc IS about. Two trap eval cases anchor the fix.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`), Zod 4 (`z.strictObject`), AI SDK v6 (`tool()` factory), `@mozilla/readability` 0.6.0, `linkedom` 0.18.12, Vitest, promptfoo 0.121.11.

---

## Plan-writing convention reminder

Per `CLAUDE.md` "Plan-writing conventions": tasks below specify **signatures, return shapes, and acceptance criteria**, not multi-line implementation bodies or verbatim test code. The impl agent reconciles against the actually-installed dep surfaces (e.g. `Readability.parse()`'s declared types in the installed 0.6.0, the AI SDK v6 `tool()` factory) rather than copying from a plan. This is the `[[ucs-mmj]]` postmortem fix.

---

## File structure map

**Create (4 new files):**

- `packages/agent/src/tools/outline.ts` — `outline()` tool factory + its closure over `Document`
- `packages/agent/src/tools/outline.test.ts` — unit tests for the tool
- `packages/agent/src/tools/read-lines.ts` — `read_lines(start, end)` tool factory + closure
- `packages/agent/src/tools/read-lines.test.ts` — unit tests for the tool
**Modify (7 existing files):**

- `packages/schemas/src/extract.ts` — `documentSchema` gains `headings`; add `headingSchema` + `Heading` type inline (no separate barrel export).
- `packages/schemas/tests/extract.test.ts` — extend with heading-field coverage.
- `packages/agent/src/url/extract.ts` — `ExtractResult` gains `headings`; new helper `extractHeadings(contentHtml: string, textContent: string) → Heading[]` exported alongside `extractContent`.
- `packages/agent/src/url/extract.test.ts` — extend with heading-extraction coverage.
- `packages/agent/src/agent.ts` — register `outline` and `read_lines` in the `tools` map passed to `streamText`. Step budget unchanged.
- `packages/agent/src/prompt.ts` — append one paragraph (verbatim text in spec §6); keep all existing rules.
- `packages/evals/suites/url-grounding/promptfooconfig.yaml` — append 2 entries to the `tests:` array (suite is a single config file with inline tests, NOT a `cases/` subdirectory).

**Update (sites that construct a `Document` literal):**

Concrete consumer list, enumerated in T1 step 4. Each needs `headings: []` appended; fixed inline if small (< 10 sites) or carved into a sibling cleanup task if not.

---

## Task order & dependency rationale

```
T1 (schema) ─┬─→ T2 (extraction sidecar) ─┐
             │                              ├─→ T6 (eval traps) → T7 (verification)
             ├─→ T3 (outline tool) ────────┤
             └─→ T4 (read_lines tool) ─────┤
                                            │
                T5 (agent + prompt wiring) ─┘
```

T1 unblocks everything: schema first so the type-checker is a sane partner during T2–T5. T3 and T4 are independent of T2 (they need `Document` to exist but not `Document.headings` to be populated — empty-headings is a valid state). T5 needs all tools registered. T6 needs T5 live. T7 verifies the whole stack.

In practice the impl team handles each as a separate bd issue / PR through the orchestrator. The dep graph above translates directly into bd `--blocker` edges at task-creation time.

---

## Task 1: Schemas — add `Document.headings`

**Files:**

- Modify: `packages/schemas/src/extract.ts` — `documentSchema` (line 21) gains `headings`; add `headingSchema` + `Heading` type inline.
- Modify: `packages/schemas/tests/extract.test.ts` — extend with heading-field coverage.

**Schema-source context (verified against the installed tree):**

- `documentSchema` is a `z.strictObject` at `packages/schemas/src/extract.ts:21` with fields `text`, `title`, `sourceUrl`.
- `Document` type is `z.infer<typeof documentSchema>` at line 54.
- `extractResponseSchema` at line 31 is `documentSchema.extend({ byteSize, scan })`, so the new `headings` field flows through automatically — no separate edit there.

- [ ] **Step 1: Write failing schema test**

Add a Vitest test asserting that `documentSchema.parse({ text: "x", title: "y", sourceUrl: "https://z", headings: [{ text: "h", level: 1, line: 1 }] })` succeeds. Add a second test asserting that omitting `headings` fails (the field is required).

Run `bun test packages/schemas`. Expect failures (field doesn't exist yet).

- [ ] **Step 2: Add the Heading type and Document.headings field**

Inline in `packages/schemas/src/extract.ts` next to `documentSchema`:

```ts
export const headingSchema = z.strictObject({
  text: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  line: z.number().int().positive()
});
export type Heading = z.infer<typeof headingSchema>;
```

Extend `documentSchema` with `headings: z.array(headingSchema)`. **No `.default([])` — keep the field required so the type-checker forces every constructor to be explicit.** Empty is `headings: []`.

- [ ] **Step 3: Run schema test**

`bun test packages/schemas`. Expect: both tests pass.

- [ ] **Step 4: Run the whole monorepo type-check**

`bun typecheck` (or whatever the repo command is — check root `package.json` "scripts"). Expect: TS errors at every site that constructs a `Document` literal without `headings`. The known consumer set (verified via `grep -rln 'documentSchema\|: Document' packages apps`):

- `apps/web/src/routes/+page.svelte`
- `apps/web/src/routes/api/extract/+server.ts`
- `packages/agent/src/agent.ts`
- `packages/agent/src/url/extract.ts` (Task 2 fixes this — produces real headings)
- `packages/agent/tests/agent.test.ts`
- `packages/evals/src/providers/agent-provider.ts`
- `packages/schemas/src/chat.ts`
- `packages/schemas/tests/extract.test.ts`

**Do not fix these yet** — Task 2 fixes the production extractor; the remaining test-fixture sites get fixed in Task 5 once the agent + tools depend on the new shape. The 7 non-extractor sites above are the bounded budget; the impl agent may file a sibling cleanup task only if the count grows past that.

- [ ] **Step 5: Commit**

```
git add packages/schemas
git commit -m "feat(schemas): add Heading type and Document.headings (ucs-tke T1)"
```

**Acceptance criteria:**

- `headingSchema` and `Heading` type exported from the same file as `Document`.
- `documentSchema` requires a `headings` array (may be empty).
- Schema-package tests pass; downstream type-check errors are catalogued (fix may defer to Task 5).

---

## Task 2: Extraction — heading sidecar in `extract.ts`

**Files:**

- Modify: `packages/agent/src/url/extract.ts`
- Modify: `packages/agent/src/url/extract.test.ts`

- [ ] **Step 1: Write failing tests for extractHeadings()**

Add tests for an exported helper `extractHeadings(contentHtml: string, textContent: string): Heading[]`. Cases to cover:

1. HTML with one h1, two h2s, three h3s in document order → 6 results, levels and order correct, every `line` ≥ 1 and within `textContent.split('\n').length`.
2. HTML with no heading elements → empty array.
3. HTML where a heading's text is mangled in textContent (e.g. internal whitespace collapsed differently) → that one heading is skipped, others still detected. **Use normalized-whitespace match per spec §3 step 3**: collapse runs of whitespace to single space, trim, lowercase, then check inclusion.
4. HTML where the same heading text appears twice in body — first match after the running cursor wins for the heading; the second body occurrence is not mis-attributed.
5. HTML containing a heading whose text appears in body BEFORE the heading does — the cursor invariant means the heading is still found at or after its own position (test by constructing a textContent where the heading appears at the expected position).

Tests use plain HTML strings + a `textContent` paired by hand. **Do not paste real Readability output** — keep fixtures small and obvious.

Run `bun test packages/agent/src/url`. Expect: tests fail (function doesn't exist).

- [ ] **Step 2: Implement extractHeadings()**

Signature: `export function extractHeadings(contentHtml: string, textContent: string): Heading[]`.

Implementation outline (do NOT paste line-by-line code in this plan):

- Parse `contentHtml` with `linkedom`'s `parseHTML` (already imported in `extract.ts`).
- `querySelectorAll('h1, h2, h3, h4, h5, h6')` in document order.
- For each heading: read `textContent`, normalize (collapse runs of whitespace to single space, trim, lowercase). Skip if empty after normalization.
- Walk `textContent.split('\n')` from a cursor (starts at 0). For each heading, find the first line index `i ≥ cursor` whose same-normalized form *includes* the normalized heading text. If found, push `{ text: <original un-normalized heading text>, level, line: i + 1 }` and set `cursor = i + 1`. If not found, skip the heading.
- `level` is `parseInt(tagName[1], 10)` — `linkedom` may upper- or lower-case `tagName`; use `toLowerCase()` first.

- [ ] **Step 3: Run extractHeadings tests**

`bun test packages/agent/src/url`. Expect: all 5 new tests pass. Existing extract tests still pass.

- [ ] **Step 4: Wire extractHeadings into extractContent()**

Modify `extractContent` to:

1. Compute `headings = extractHeadings(article.content ?? '', text)` after the `text.length < MIN_VIABLE_EXTRACTION` guard.
2. Return `{ text, title: (article.title ?? '').trim(), headings }`.

**Do NOT change `text` derivation** — keep `article.textContent.trim()` exactly as today. Line numbers are load-bearing.

Update `ExtractResult`:

```ts
export type ExtractResult = { text: string; title: string; headings: Heading[] };
```

Import `Heading` from the schemas package.

- [ ] **Step 5: Extend extract.test.ts for the integrated path**

Add: feed a real-ish RFC-style HTML fixture (a few headings + paragraphs) through `extractContent`; assert `result.headings.length > 0`, levels are correct, lines fall within the emitted text, AND `result.text` is byte-identical to the prior expectation (i.e. no drift). Pin the prior text expectation by running once, copying the output, and freezing it as the test expectation.

Run `bun test packages/agent/src/url`. Expect: all pass.

- [ ] **Step 6: Commit**

```
git add packages/agent/src/url
git commit -m "feat(agent): heading sidecar in extract.ts (ucs-tke T2)"
```

**Acceptance criteria:**

- `extractHeadings()` exported; 5 unit-test cases pass.
- `extractContent()` returns `headings: Heading[]`; `text` byte-for-byte unchanged for any input that previously extracted successfully.
- `ExtractResult` type updated; downstream callers compile.

---

## Task 3: `outline()` tool

**Files:**

- Create: `packages/agent/src/tools/outline.ts`
- Create: `packages/agent/src/tools/outline.test.ts`

- [ ] **Step 1: Write failing tests**

Tests for a `makeOutline(documentText: string, headings: Heading[])` factory returning an AI SDK `tool`. Cases:

1. Given `headings: [{text: 'A', level: 1, line: 10}, {text: 'B', level: 2, line: 25}]`, calling the tool's `execute` with `{}` returns `{ headings: [<same two entries, in order>] }`.
2. Given `headings: []`, execute returns `{ headings: [] }` (not an error).
3. The tool's `description` field is non-empty and mentions both "headings" and "structure" — verifies the model-facing guidance exists. (Soft test; serves as a regression alarm if someone strips the description.)

Run `bun test packages/agent/src/tools/outline`. Expect: file-not-found.

- [ ] **Step 2: Implement makeOutline()**

Signature: `export function makeOutline(documentText: string, headings: Heading[])` — returns `ReturnType<typeof tool>`.

- `inputSchema`: `z.strictObject({})` (no parameters).
- `execute`: returns `{ headings }`. (No `documentText` use right now — included in the signature for future symmetry with other tools and to keep the factory shape consistent with `makeGrepDoc`.)
- `description`: short, model-facing. Per spec §3.1: "Returns the document's heading structure with line numbers. Call when you need to know what the document covers — always reasonable at the start of a question. After a `grep_doc` zero-match, call `outline()` to find the relevant section before refusing." (Adjust phrasing to match the existing `grep-doc.ts` description voice.)

- [ ] **Step 3: Run tests**

`bun test packages/agent/src/tools/outline`. Expect: pass.

- [ ] **Step 4: Commit**

```
git add packages/agent/src/tools/outline.ts packages/agent/src/tools/outline.test.ts
git commit -m "feat(agent): add outline() tool (ucs-tke T3)"
```

**Acceptance criteria:**

- `makeOutline` factory exported; tests pass.
- Description string teaches the agent when to call it.

---

## Task 4: `read_lines()` tool

**Files:**

- Create: `packages/agent/src/tools/read-lines.ts`
- Create: `packages/agent/src/tools/read-lines.test.ts`

- [ ] **Step 1: Write failing tests**

Tests for `makeReadLines(documentText: string)` factory. Cases:

1. **Happy path:** doc with 10 lines, `read_lines(3, 5)` returns `{ text: "L3 | <line3>\nL4 | <line4>\nL5 | <line5>", truncated: false }`. Exact `Lxx | ` formatting.
2. **Clamping low:** `read_lines(-5, 2)` → returns lines 1-2.
3. **Clamping high:** `read_lines(8, 9999)` on a 10-line doc → returns lines 8-10.
4. **Out-of-range range** (`start > lineCount`): returns `{ text: '', truncated: false }`.
5. **Inverted range** (`start > end` after clamping): returns `{ text: '', truncated: false }`.
6. **Truncation:** `read_lines(1, 500)` on a 1000-line doc → returns lines 1-200, `truncated: true`.
7. **Exact-at-cap:** `read_lines(1, 200)` returns 200 lines, `truncated: false`.

Run tests. Expect: file-not-found.

- [ ] **Step 2: Implement makeReadLines()**

Signature: `export function makeReadLines(documentText: string)` returning `ReturnType<typeof tool>`.

- `inputSchema`: `z.strictObject({ start: z.number().int(), end: z.number().int() })`.
- Internal constants: `MAX_LINES = 200`.
- `execute`:
  - Split `documentText` once at factory-construction time and close over the array (avoid re-splitting per call).
  - Clamp `start` to `[1, lineCount]`, `end` to `[1, lineCount]`.
  - If `start > end` after clamping → return `{ text: '', truncated: false }`.
  - If `end - start + 1 > MAX_LINES` → set `end = start + MAX_LINES - 1`, mark `truncated: true`.
  - Slice lines `[start-1, end]`, format each as `` `L${i+1} | ${line}` ``, join with `\n`.
  - Return `{ text, truncated }`.
- `description`: per spec §3.2 — "Returns up to 200 lines of raw text from the document, prefixed with `Lxx | ` so you can cite directly. Use after a `grep_doc` hit to read surrounding context, or after `outline()` to read a section. Range is 1-based and inclusive; out-of-range or inverted ranges return empty text."

- [ ] **Step 3: Run tests**

Expect: all 7 cases pass.

- [ ] **Step 4: Commit**

```
git add packages/agent/src/tools/read-lines.ts packages/agent/src/tools/read-lines.test.ts
git commit -m "feat(agent): add read_lines() tool (ucs-tke T4)"
```

**Acceptance criteria:**

- `makeReadLines` factory exported; 7 unit-test cases pass.
- 200-line cap enforced; clamping is well-defined for all 7 edge cases.

---

## Task 5: Agent wiring + system prompt + fix lingering Document literals

**Files:**

- Modify: `packages/agent/src/agent.ts`
- Modify: `packages/agent/src/prompt.ts`
- Modify: any remaining test fixtures with `Document` literals that the type-checker flags.

- [ ] **Step 1: Register the new tools in agent.ts**

Locate the `tools: { grep_doc, finalize }` object passed to `streamText`. Add `outline: makeOutline(documentText, document.headings)` and `read_lines: makeReadLines(documentText)`. Import `makeOutline` and `makeReadLines`. **Do not change `stopWhen`** — `[stepCountIs(10), hasToolCall('finalize')]` stays as is. **Do not change `temperature`** — stays 0.

- [ ] **Step 2: Append the new paragraph to prompt.ts**

Verbatim text from spec §6 (the paragraph beginning "Two more tools are available."). **Append** — do not rewrite or remove existing rules. Particularly preserve the prompt-injection defense paragraph (about treating grep_doc results as data not instructions) and the `finalize`-is-required language.

- [ ] **Step 3: Resolve any remaining Document-literal typecheck errors**

Run `bun typecheck`. For each TS error reporting that `headings` is missing on a `Document` constructor, add `headings: []` (test fixtures) or thread through the real headings (production code, though there should be no such site outside `extract.ts` which Task 2 already fixed).

- [ ] **Step 4: Run the full test suite**

```
bun test
```

Expect: all green. The agent's chat-route tests should still pass even though the agent's behavior is now richer — the test assertions are on contract (the `finalize` shape and the response stream), not on tool-call counts.

- [ ] **Step 5: Smoke-test the agent locally against the existing 5 url-grounding cases**

This is a sanity step before the eval gate runs. Confirm:

```
bun packages/evals/...run url-grounding   # exact command per repo conventions
```

…still shows 5/5 pass. The new tools must not regress existing behavior.

If the smoke-test fails for an existing case, STOP and diagnose before continuing — the tool registrations or prompt update introduced a regression and Task 6 will not fix it.

- [ ] **Step 6: Commit**

```
git add packages/agent
git commit -m "feat(agent): wire outline + read_lines; teach fallback ladder (ucs-tke T5)"
```

**Acceptance criteria:**

- Two new tools registered alongside `grep_doc` and `finalize`.
- System prompt has the new paragraph; all existing rules preserved verbatim.
- `bun typecheck` clean; `bun test` green.
- 5 existing url-grounding cases still 5/5 (smoke).

---

## Task 6: Trap eval cases

**Files:**

- Modify: `packages/evals/suites/url-grounding/promptfooconfig.yaml` — append 2 entries to the existing `tests:` array.

**Suite-source context (verified against the installed tree):** the url-grounding suite is a single `promptfooconfig.yaml`. There is **no `cases/` subdirectory and no per-case files**. Tests are inline entries in the `tests:` array. Each entry has `description`, `vars: { kb_url, question }`, optional per-case `assert:` block. The global `defaultTest.assert` already wires the grounding judge (`file://../../src/asserts/grounding-judge.ts`) and a regex check for `L\d+` — both apply automatically to new cases.

Existing entry shape (one of the 5):

```yaml
- description: HTCPCP expansion grounded in RFC 2324
  vars:
    kb_url: https://www.rfc-editor.org/rfc/rfc2324.html
    question: What does HTCPCP stand for?
  assert:
    - type: contains
      value: Hyper Text Coffee Pot Control Protocol
```

- [ ] **Step 1: Append `trap_encryption` to `tests:`**

```yaml
- description: 'trap: HTCPCP does not specify encryption (must refuse, not fabricate)'
  vars:
    kb_url: https://www.rfc-editor.org/rfc/rfc2324.html
    question: What encryption algorithms does HTCPCP use?
  assert:
    - type: contains
      value: 'does not'           # the refusal phrase
    - type: not-contains
      value: 'AES'                # known fabrication target
    - type: not-contains
      value: 'ChaCha20'           # known fabrication target
```

The per-case `assert` is a deterministic guard against the specific fabrication pattern from calibration row 6. The JS grounding judge from `defaultTest.assert` still runs on top and must also pass.

- [ ] **Step 2: Append `trap_japanese_tea` to `tests:`**

```yaml
- description: 'trap: RFC 7168 does not specify Japanese tea varieties (must refuse, not fabricate)'
  vars:
    kb_url: https://www.rfc-editor.org/rfc/rfc7168.html
    question: What Japanese tea varieties does this protocol define?
  assert:
    - type: contains
      value: 'does not'
    - type: not-contains
      value: 'matcha'
    - type: not-contains
      value: 'sencha'
    - type: not-contains
      value: 'hojicha'
```

- [ ] **Step 3: Run the suite**

Confirm the exact run command by reading the eval package's `package.json` scripts. The command runs all 7 cases (5 existing + 2 traps).

Expect: the 7 cases run end-to-end without infra errors. The 2 trap cases may pass or fail at this point depending on how much T1–T5 changed agent behavior — that determination happens in T7. **The 5 existing cases must remain in their prior pass/fail state.** If an existing case flips, STOP and bisect.

- [ ] **Step 4: Commit**

```
git add packages/evals/suites/url-grounding/promptfooconfig.yaml
git commit -m "test(evals): add trap_encryption + trap_japanese_tea (ucs-tke T6)"
```

**Acceptance criteria:**

- 2 new entries appended to the `tests:` array in `promptfooconfig.yaml`.
- Per-case `assert` blocks include `contains: 'does not'` + `not-contains` on the known fabrication targets.
- Suite runs end-to-end (no infra errors).
- Existing 5 cases unchanged in pass/fail status.

---

## Task 7: Verification — pre-merge eval, calibration, drift check

This task is verification, not implementation. The output is a written record in the PR body, not new code.

- [ ] **Step 1: Capture pre-merge state on `main`**

Before the toolset PR merges, checkout `main` and run the suite:

```bash
git stash       # if dirty
git checkout main
bun packages/evals/...run url-grounding
```

Expected: both trap cases FAIL (the whole point of the spec). Record the output in the PR body as the "before" snapshot.

- [ ] **Step 2: Capture post-merge state on the feature branch**

Switch back to the feature branch with all 7 tasks landed. Re-run the suite.

Expected: both trap cases PASS. Existing 5 cases still PASS (5/5 → 7/7).

If a trap case still fails: the agent is still fabricating despite having the tools. Diagnose by reading the agent's tool-call trace (the suite logs `provider.metadata.toolCalls` per case). Common causes: (a) outline returned `[]` so the agent had no structural fallback — RFC 2324 / 7168 *do* have headings, so this would indicate a Task 2 bug. (b) Agent didn't call outline at all — prompt-update wording was too soft. (c) Agent called outline but still hallucinated — escalate to a follow-up bd issue, the spec promises this; flag it explicitly.

If an existing case fails: regression. STOP, bisect.

- [ ] **Step 3: Re-run gold-set calibration**

```bash
bun packages/evals/...calibrate    # or the existing script per repo conventions
```

Expected: Cohen's κ between 0.75 and 0.85 (within ±0.05 of the 0.80 baseline). Record the new value + confusion matrix in the PR body.

If κ < 0.75: the judge is now grading refusals inconsistently. Two paths: (a) re-label the gold set to include the new failure mode style, (b) tweak the judge prompt to better handle refusal-style answers. File a bd issue rather than blocking this PR if the drift is small (κ in [0.70, 0.75)).

- [ ] **Step 4: Line-number drift check**

Pick 3 citations from `docs/evals/grounding-judge-calibration-2026-05-20.md`:

- Row 2 cites `L228` and `L231` (RFC 2324, "418 I'm a teapot")
- Row 4 cites `L5` (RFC 2324 publication line)
- Row 5 cites `L131, L137, L142-L144, L155` (RFC 7168 Alternates section)

For each, run a quick script that loads the document via the production fetch+extract pipeline and prints `lines[228-1]`, `lines[231-1]`, etc. Verify the content at each line matches the calibration row's `judge_reason`.

A one-off helper script suffices. The agent package exports `safeFetch` and `extractContent` separately (verified in `packages/agent/src/index.ts`) — there is no combined `fetchAndExtract` helper. Compose the two:

```ts
// scripts/verify-line-drift.ts (one-off; do not commit)
import { safeFetch, extractContent } from '../packages/agent/src/index';

const url = 'https://www.rfc-editor.org/rfc/rfc2324.html';
const fetched = await safeFetch(url);
if (!fetched.ok) throw new Error(`fetch failed: ${JSON.stringify(fetched.error)}`);

const extracted = extractContent(fetched.value.html, fetched.value.finalUrl);
if ('kind' in extracted) throw new Error(`extract failed: ${extracted.kind}`);

const lines = extracted.text.split('\n');
console.log('L228:', lines[227]);
console.log('L231:', lines[230]);
console.log('L5:',   lines[4]);
```

Repeat for RFC 7168 to verify row 5's citations (L131, L137, L142-L144, L155).

Expected: line content matches what each calibration row claimed it cited. If any line shifted by even 1, T2 introduced drift — fix before merge.

Record the verification output in the PR body.

- [ ] **Step 5: Open the PR for merge review**

PR body must include:

- Before/after suite output (Step 1, Step 2).
- κ before/after (0.80 → new value).
- Line-drift verification (Step 4).
- Cross-reference to `ucs-tke` and `docs/specs/2026-05-20-agent-navigation-tools.md`.

The PR is merged via the orchestrator's `pr-merge` action only after `gate:review` and `gate:evals` clear (gates set at task-enrichment time per the labels-per-task convention).

**Acceptance criteria (Task 7 = umbrella close-out):**

1. ✅ `bun test` green.
2. ✅ Trap cases FAIL on `main` → PASS on the feature branch.
3. ✅ Existing 5 cases stay 5/5.
4. ✅ κ within [0.75, 0.85].
5. ✅ Line-number drift check: 3 sample citations point at the same content as before.
6. ✅ PR body documents all five.

---

## Out-of-scope follow-ups (do NOT include in this plan)

Reaffirming spec §"Out of scope (captured elsewhere)":

- `grep_doc(regex?, context_lines?)` extension — file a new bd issue + roadmap entry only if real evidence emerges.
- Anthropic Citations API, multi-grep batch, citation-verifier, retrieval-planning, structured output, top-K reranking — all in `docs/agent-hardening-roadmap.md`, unchanged.
- Eval-suite expansion beyond the 2 trap cases — next epic, after we have signal on whether the navigation tools generalize.

Any of these surfacing during impl: file a fresh bd issue, do not graft onto this plan.
