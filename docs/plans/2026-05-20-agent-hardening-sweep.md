# Agent Hardening Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan-writing convention for this repo:** Per `.claude/skills/using-this-repo/SKILL.md` § "Plan-writing conventions", tasks specify signatures, acceptance criteria, and affected files — **not** verbatim implementation bodies. The impl agent reconciles against installed deps and the type-checker.

**Spec:** `docs/specs/2026-05-20-agent-hardening-sweep.md`

**Goal:** Ship 5 cheap agent tunings serially (eval-tested before/after each) plus an architecture-roadmap doc, so the agent never produces empty output and citation precision improves.

**Architecture:** Five Tier 1+2 tunings — `temperature: 0`, step budget 5→8, system-prompt rewrite, tool description tightening, and a `finalize` sentinel tool — each in its own PR. The sentinel tool (T5) is the structural fix: `hasToolCall('finalize')` becomes the stop condition, making empty output impossible by design. T6 ships a markdown roadmap of Tier 3 ideas. Each impl PR re-runs calibration + suite and commits both snapshots, so individual contributions are measurable.

**Tech Stack:** TypeScript, Bun, vitest, AI SDK `ai@6.0.184`, `@ai-sdk/anthropic@3.0.78`, Anthropic Sonnet 4.6, Zod 4 (`z.strictObject`), `@url-cheat-sheet/agent` workspace, `@url-cheat-sheet/evals` workspace.

---

## File structure

| File | T# | Intent | Responsibility |
|---|---|---|---|
| `packages/agent/src/agent.ts` | T1, T2, T5 | modify | `streamText` config — add `temperature`, bump step count, add `finalize` tool to `tools` map, switch `stopWhen` to array. |
| `packages/agent/src/prompt.ts` | T3, T5 | modify | Rewrite `SYSTEM_PROMPT` with budget/never-empty/strict-Lxx rules. T5 adds the "always call finalize" line. |
| `packages/agent/src/tools/grep-doc.ts` | T4 | modify | Extend tool `description` with phrasing guidance + empty-match handling. |
| `packages/agent/src/tools/finalize.ts` | T5 | create | New sentinel tool. `description` + Zod schema for `{answer, citations}`. Exported. |
| `packages/agent/src/index.ts` | T5 | modify | Export the `finalize` tool from the package root. |
| `packages/agent/tests/agent.test.ts` | T5 | modify | Add unit test verifying `finalize` is in `tools` map; `streamText` mocked. |
| `packages/agent/tests/finalize.test.ts` | T5 | create | New test file — Zod schema validation, empty-answer rejection. |
| `packages/evals/src/providers/agent-provider.ts` | T5 | modify | `drainAssistantText` updated to extract `finalize` tool-call's `answer` argument. |
| `packages/evals/tests/agent-provider.test.ts` | T5 | modify | Adapt existing tests; add test for new finalize-extraction path. |
| `docs/agent-hardening-roadmap.md` | T6 | create | Tier 3 ideas in 1-paragraph bullets each. |
| `docs/evals/grounding-judge-calibration-<date>.md` | T1-T5 | create (auto) | Fresh calibration snapshot per merge. |
| `docs/evals/url-grounding-<date>.md` | T1-T5 | create/overwrite (auto) | Fresh suite snapshot per merge. |

---

## Library reference (verified)

### AI SDK v6 `stopWhen` (`ai@6.0.184`)

From `node_modules/.bun/ai@6.0.184/.../dist/index.d.ts`:

- `stopWhen` accepts a single `StopCondition<TOOLS>` OR `StopCondition<TOOLS>[]`. Array → stops on any.
- Built-ins exported from `'ai'`: `stepCountIs(n: number)`, `hasToolCall(toolName: string)`. There's also `isLoopFinished()` but it doesn't gate stop.
- Custom predicate signature: `({ steps }) => boolean` where `steps` is the step-history array.

For T5: `stopWhen: [stepCountIs(10), hasToolCall('finalize')]`.

### AI SDK v6 `tool()` helper (`ai@6.0.184`)

```ts
import { tool } from 'ai';
import { z } from 'zod';

export const myTool = tool({
  description: '…',
  inputSchema: z.strictObject({ /* fields */ })
});
```

Verify the exact `tool()` import path against `node_modules/.bun/ai@6.0.184/.../dist/index.d.ts` — it MAY be a named export `tool` or it MAY require `import { tool } from 'ai/tool'`. Either way the impl agent confirms before pasting.

### Zod 4 strict objects (CLAUDE.md hard rule)

Always `z.strictObject({...})`, never `z.object(...).strict()`.

### AI SDK v6 streaming + tool-input arguments

When the model calls a tool, the stream emits `tool-input-start` / `tool-input-delta` / `tool-input-available` chunks for that tool. The argument is reconstructed from the deltas. For T5's drain rewrite: read the AI SDK's `UIMessageChunk` discriminated union (verified earlier in `docs/plans/2026-05-19-grounding-eval-matrix.v2.md` § "Library reference") and pull the `finalize` tool's input via the `tool-input-available` chunk (which has the fully-assembled JSON).

---

## Task 1: temperature: 0

**Files:**
- Modify: `packages/agent/src/agent.ts`
- Modify: `packages/agent/tests/agent.test.ts`

**Acceptance criteria:**

1. `streamText` config object in `agent.ts` includes `temperature: 0`.
2. New unit test asserts that the mocked `streamText` call receives `temperature: 0` in its options.
3. `bun run typecheck && bun run lint` clean.
4. Live eval re-run: calibration κ unchanged within ±0.05 of baseline 0.80; suite snapshot reproducible across two runs (same passes, same citation set).

- [ ] **Step 1: Write the failing test**

In `packages/agent/tests/agent.test.ts`, add a new test that mocks `'ai'` (specifically `streamText`), calls `streamChat(messages, document)`, and asserts `vi.mocked(streamText).mock.calls[0][0]` has `temperature: 0`.

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/agent/tests/agent.test.ts`
Expected: new test FAILS (no `temperature` in current config).

- [ ] **Step 3: Implement**

In `packages/agent/src/agent.ts`, add `temperature: 0` to the `streamText` options object alongside the existing `model`, `system`, `messages`, `tools`, `stopWhen` fields.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/agent/tests/agent.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 6: Commit + push**

```bash
git add packages/agent/src/agent.ts packages/agent/tests/agent.test.ts
git commit -m "fix(agent): temperature: 0 for grounded QA reproducibility"
git push
```

- [ ] **Step 7: Live eval re-run (post-merge, in the merged-to-main worktree)**

```bash
bun packages/evals/src/calibrate-judge.ts
bun packages/evals/src/run.ts url-grounding
git add docs/evals/grounding-judge-calibration-*.md docs/evals/url-grounding-*.md
git commit -m "test(evals): post-T1 snapshots (temperature: 0)"
git push
```

Capture in the commit body: κ delta vs prior, suite pass-count delta, one-line conclusion.

---

## Task 2: bump step budget 5 → 8

**Files:**
- Modify: `packages/agent/src/agent.ts:20` — the `stopWhen` argument.
- Modify: `packages/agent/tests/agent.test.ts`

**Acceptance criteria:**

1. `stopWhen` argument is `stepCountIs(8)` instead of `stepCountIs(5)`.
2. New unit test asserts the step count is 8.
3. Live eval re-run: url-grounding test 2 (HTCPCP-TEA varieties) ships a non-empty answer with at least one `Lxx` citation. Tests 1, 3, 4, 5 unchanged.

- [ ] **Step 1: Write the failing test**

In `packages/agent/tests/agent.test.ts`, add a test asserting the mocked `streamText` call receives `stopWhen` that, when called with a fake `{ steps: [...] }` of length 8, returns `true` (i.e., the budget IS 8). The cleanest way: mock `stepCountIs` from `'ai'` and assert `vi.mocked(stepCountIs)` was called with `8`.

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/agent/tests/agent.test.ts`
Expected: new test FAILS (`stepCountIs` called with 5, not 8).

- [ ] **Step 3: Implement**

In `packages/agent/src/agent.ts`, change `stepCountIs(5)` to `stepCountIs(8)`.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/agent/tests/agent.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 6: Commit + push**

```bash
git add packages/agent/src/agent.ts packages/agent/tests/agent.test.ts
git commit -m "fix(agent): bump tool-call budget 5 → 8 (closes ucs-3cv)"
git push
```

- [ ] **Step 7: Live eval re-run (post-merge)**

Same procedure as T1 Step 7. Capture κ delta, suite pass-count delta, and whether test 2 now passes. Commit both snapshots.

---

## Task 3: system-prompt rewrite

**Files:**
- Modify: `packages/agent/src/prompt.ts` — replace `SYSTEM_PROMPT` constant.
- Modify: `packages/agent/tests/agent.test.ts` — adapt existing tests that check prompt content; add new tests for the 3 new rules.

**Acceptance criteria:**

1. `SYSTEM_PROMPT` includes (in order, top of prompt):
   - Identity/role line: "You answer questions about a document the user has loaded."
   - Budget rule: "You have at most 8 tool calls per turn. Reserve at least one step for your final answer — never end a turn without text."
   - Never-empty rule: "Always produce a final answer. If `grep_doc` returns no useful matches after two attempts on related queries, say so honestly — 'I couldn't find this in the document' is a valid answer."
2. Citation rule (replaces the current fuzzy example):
   - "Cite line numbers exactly as returned by `grep_doc` in the form `Lxx` (e.g., `L142`, `L228-L231`). Do not estimate or round."
   - "Every factual claim must end with an `Lxx` citation; uncited claims are forbidden."
3. Existing rules preserved: untrusted-data warning about `grep_doc` results, tool usage guidance, "no markdown formatting".
4. Budget rule repeated near the END of the prompt (Anthropic Prompting 101: repeat critical instructions).
5. Existing tests in `agent.test.ts` that check `SYSTEM_PROMPT.toMatch(...)` still pass (the rules they check — `grep_doc`, untrusted/data-not-instructions, line numbers, no markdown — are preserved).
6. New tests assert: budget rule present, never-empty rule present, strict Lxx format present.
7. Live eval re-run: calibration κ ≥ 0.80 (current baseline). Suite snapshot reasons no longer contain "approximate" / "rounded" qualifiers on citations.

- [ ] **Step 1: Write the failing tests**

In `agent.test.ts`'s `describe('SYSTEM_PROMPT', …)` block, add three new tests:

```ts
it('budgets tool calls and reserves one for the final answer', () => {
  expect(SYSTEM_PROMPT).toMatch(/at most 8 tool calls/i);
  expect(SYSTEM_PROMPT.toLowerCase()).toContain('never end a turn without text');
});
it('forbids empty answers and offers a graceful no-answer phrasing', () => {
  expect(SYSTEM_PROMPT).toMatch(/always produce a final answer/i);
  expect(SYSTEM_PROMPT.toLowerCase()).toContain("i couldn't find this in the document");
});
it('requires exact Lxx citation format with no estimation', () => {
  expect(SYSTEM_PROMPT).toMatch(/exactly as returned by grep_doc/i);
  expect(SYSTEM_PROMPT.toLowerCase()).toContain('do not estimate or round');
  expect(SYSTEM_PROMPT.toLowerCase()).toContain('uncited claims are forbidden');
});
```

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/agent/tests/agent.test.ts`
Expected: 3 new tests FAIL. Existing 3 SYSTEM_PROMPT tests still PASS.

- [ ] **Step 3: Implement**

Rewrite `SYSTEM_PROMPT` in `packages/agent/src/prompt.ts` per the acceptance criteria. Keep the existing untrusted-data / no-markdown / tool-usage rules; add the 3 new rules; repeat the budget rule at the bottom.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/agent/tests/agent.test.ts`
Expected: all SYSTEM_PROMPT tests PASS (existing 3 + new 3).

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 6: Commit + push**

```bash
git add packages/agent/src/prompt.ts packages/agent/tests/agent.test.ts
git commit -m "fix(agent): system prompt enforces budget, never-empty, strict Lxx"
git push
```

- [ ] **Step 7: Live eval re-run (post-merge)**

Same procedure as T1/T2 Step 7.

---

## Task 4: tighten `grep_doc` tool description

**Files:**
- Modify: `packages/agent/src/tools/grep-doc.ts` — extend the tool's `description`.
- Modify: `packages/agent/tests/grep-doc.test.ts` if it exists (otherwise create) — assert description includes the new guidance.

**Acceptance criteria:**

1. `grep_doc` tool description includes (in order):
   - Behavior: "Case-insensitive substring search over document lines, with ±2 lines of context. Returns matching lines labeled `Lxx`."
   - Query guidance: "Use short distinctive substrings — section headings, unique nouns — not full sentences."
   - Empty-match handling: "Empty results mean the term is not in the document; retry at most once with a synonym, then give up and answer honestly."
2. New (or modified) test in `grep-doc.test.ts` asserts the description includes phrases like "short distinctive substrings" and "retry at most once".
3. Existing behavior unchanged — no signature changes, no API changes. Only the `description` string field grows.

- [ ] **Step 1: Locate the tool definition**

Read `packages/agent/src/tools/grep-doc.ts`. The exported `makeGrepDoc(text: string)` function returns an object with `description` and `inputSchema` (AI SDK `tool()` shape). Find the current `description` value.

- [ ] **Step 2: Write the failing test**

If `packages/agent/tests/grep-doc.test.ts` exists, add tests there. If not, create the file and add:

```ts
import { describe, expect, it } from 'vitest';
import { makeGrepDoc } from '../src/tools/grep-doc';

describe('makeGrepDoc tool description', () => {
  it('steers query phrasing toward distinctive substrings', () => {
    const t = makeGrepDoc('any doc text');
    expect(t.description).toMatch(/short distinctive substrings/i);
  });
  it('documents empty-match handling', () => {
    const t = makeGrepDoc('any doc text');
    expect(t.description).toMatch(/retry at most once/i);
    expect(t.description.toLowerCase()).toContain('not in the document');
  });
});
```

- [ ] **Step 3: Run, expect red**

Run: `bunx vitest run packages/agent/tests/grep-doc.test.ts`
Expected: tests FAIL.

- [ ] **Step 4: Implement**

In `packages/agent/src/tools/grep-doc.ts`, replace the existing `description` string with the new one per the acceptance criteria. Keep `inputSchema` unchanged.

- [ ] **Step 5: Run, expect green**

Run: `bunx vitest run packages/agent/tests/`
Expected: new tests PASS. Existing tests unchanged.

- [ ] **Step 6: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 7: Commit + push**

```bash
git add packages/agent/src/tools/grep-doc.ts packages/agent/tests/grep-doc.test.ts
git commit -m "fix(agent): tighten grep_doc tool description with query + empty-match guidance"
git push
```

- [ ] **Step 8: Live eval re-run (post-merge)**

Same procedure. Watch per-test `numRequests` in the snapshot — expect it to trend down vs baseline.

---

## Task 5: `finalize` sentinel tool + `hasToolCall` stop

**Files:**
- Create: `packages/agent/src/tools/finalize.ts`
- Create: `packages/agent/tests/finalize.test.ts`
- Modify: `packages/agent/src/agent.ts` — import `finalize`, add to tools map, switch `stopWhen` to array.
- Modify: `packages/agent/src/index.ts` — export `finalize` if downstream consumers (route, evals) need direct access.
- Modify: `packages/agent/src/prompt.ts` — add a line at the bottom: "End every turn by calling the `finalize` tool with your answer + citations. Do not produce free-form text outside `finalize`."
- Modify: `packages/agent/tests/agent.test.ts` — update tests for new tools map + stopWhen shape.
- Modify: `packages/evals/src/providers/agent-provider.ts` — drain logic now extracts the `finalize` tool's `answer` argument.
- Modify: `packages/evals/tests/agent-provider.test.ts` — adapt happy-path test for the new drain shape; existing failure-path tests untouched.

**Acceptance criteria:**

1. `packages/agent/src/tools/finalize.ts` default-exports a tool created via the AI SDK's `tool()` helper:
   - `description`: "Emit your final answer. Call this exactly once at the end of your turn. The `answer` field is shown verbatim to the user; the `citations` list is rendered after the answer. Calls with an empty `answer` are rejected."
   - `inputSchema`: `z.strictObject({ answer: z.string().min(1), citations: z.array(z.string()).default([]) })`.
2. `agent.ts`'s tools map: `{ grep_doc: makeGrepDoc(document.text), finalize }`.
3. `agent.ts`'s `stopWhen`: `[stepCountIs(10), hasToolCall('finalize')]`. (Step count bumped from 8 in T2 to 10 here because tool calls now include `finalize`.)
4. `prompt.ts` includes the line: "End every turn by calling the `finalize` tool with your answer + citations. Do not produce free-form text outside `finalize`."
5. New unit tests in `finalize.test.ts`:
   - Empty `answer` fails Zod parse: `finalize.inputSchema.safeParse({ answer: '', citations: [] }).success === false`.
   - Valid args parse: `finalize.inputSchema.safeParse({ answer: 'x', citations: ['L1'] }).success === true`.
   - Description mentions "exactly once" and "Calls with an empty `answer` are rejected" (or equivalent).
6. Updated `agent.test.ts`: assert `vi.mocked(streamText).mock.calls[0][0].tools` has BOTH `grep_doc` AND `finalize` keys.
7. Updated `agent-provider.ts` `drainAssistantText`: walks the stream looking for the `finalize` tool's `tool-input-available` chunk, extracts `answer` (string) and `citations` (string[]), returns `answer + (citations.length ? ` (citations: ${citations.join(', ')})` : '')`. If no `finalize` call is observed (budget exhausted without finalize), returns the empty string — the judge's existing ucs-xom guard handles this as fail.
8. Updated `agent-provider.test.ts` happy-path mock: `mockUIMessageStreamResponse` now needs to emit a `tool-input-start` / `tool-input-delta(s)` / `tool-input-available` sequence for `finalize` instead of (or in addition to) raw text deltas. The expected `output` becomes the `answer` content (+ citations if any).
9. `bun run test` from repo root passes — all packages green.
10. Live eval re-run: url-grounding suite produces non-empty output on ALL 5 tests. Calibration κ ≥ 0.60 (re-running matters because the judge's `output` parameter content shape changes — text now arrives from `finalize.answer`, not free-form text deltas).
11. apps/web manual smoke-check: chat UI displays the `finalize.answer` content in the chat thread. If `@ai-sdk/svelte`'s Chat component doesn't render it naturally, add a small renderer; flag as follow-up if larger work needed.

- [ ] **Step 1: Write the `finalize` tool's failing tests**

Create `packages/agent/tests/finalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { finalize } from '../src/tools/finalize';

describe('finalize tool', () => {
  it('rejects empty answer via Zod', () => {
    const parsed = finalize.inputSchema.safeParse({ answer: '', citations: [] });
    expect(parsed.success).toBe(false);
  });
  it('accepts valid answer + citations', () => {
    const parsed = finalize.inputSchema.safeParse({ answer: 'hello', citations: ['L1'] });
    expect(parsed.success).toBe(true);
  });
  it('defaults citations to []', () => {
    const parsed = finalize.inputSchema.safeParse({ answer: 'hello' });
    expect(parsed.success && parsed.data.citations).toEqual([]);
  });
  it('description tells the model when to call it', () => {
    expect(finalize.description.toLowerCase()).toContain('exactly once');
    expect(finalize.description.toLowerCase()).toContain('empty');
  });
});
```

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/agent/tests/finalize.test.ts`
Expected: tests FAIL (module doesn't exist).

- [ ] **Step 3: Implement `finalize.ts`**

Create `packages/agent/src/tools/finalize.ts` per acceptance criterion 1. Use `import { tool } from 'ai';` and `import { z } from 'zod';` — verify the `tool` import path against `node_modules/.bun/ai@6.0.184/.../dist/index.d.ts` first. Default-export the tool object.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/agent/tests/finalize.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Wire `finalize` into `agent.ts`**

Update `packages/agent/src/agent.ts`:
- Import `finalize` from `./tools/finalize`.
- Add to tools map: `tools: { grep_doc: makeGrepDoc(document.text), finalize }`.
- Change `stopWhen: stepCountIs(8)` to `stopWhen: [stepCountIs(10), hasToolCall('finalize')]`.
- Import `hasToolCall` from `'ai'` alongside `stepCountIs`.

- [ ] **Step 6: Update `agent.test.ts`**

Modify existing tests (or add new ones) to assert:
- `streamText` is called with `tools` containing both `grep_doc` and `finalize` keys.
- `streamText` is called with `stopWhen` that is an array of length 2.

Existing prompt-content tests stay intact.

- [ ] **Step 7: Add the prompt directive**

In `packages/agent/src/prompt.ts`, append (just before the closing backtick):

> End every turn by calling the `finalize` tool with your answer + citations. Do not produce free-form text outside `finalize`.

Add a corresponding test in `agent.test.ts`:

```ts
it('instructs the model to call finalize at the end of every turn', () => {
  expect(SYSTEM_PROMPT.toLowerCase()).toContain('finalize');
  expect(SYSTEM_PROMPT.toLowerCase()).toContain('end every turn');
});
```

- [ ] **Step 8: Run agent tests, expect green**

Run: `bunx vitest run packages/agent/tests/`
Expected: all PASS.

- [ ] **Step 9: Update `agent-provider.ts` drain to extract from `finalize`**

In `packages/evals/src/providers/agent-provider.ts`, modify `drainAssistantText` (or whatever the helper is named):

- Continue iterating through the parsed `UIMessageChunk` stream.
- Track the `finalize` tool's `tool-input-available` chunk specifically (it has the final assembled JSON args). Extract `answer` (string) and `citations` (string[]).
- After the stream ends:
  - If `finalize` was called: return `answer + (citations.length ? ' (citations: ' + citations.join(', ') + ')' : '')`.
  - Else: return `''`. The judge's ucs-xom guard catches this as fail.

Verify the `tool-input-available` chunk's shape against the installed `ai@6.0.184` `UIMessageChunk` union. Field name for the assembled input is likely `input` — confirm.

- [ ] **Step 10: Update `agent-provider.test.ts`**

The existing `mockUIMessageStreamResponse(deltas: string[])` helper needs an alternative or update. Add a new helper `mockUIMessageStreamFinalizeResponse(answer: string, citations: string[])` that emits the proper `tool-input-start` / `tool-input-delta` / `tool-input-available` chunks for a `finalize` call. Use this in the happy-path test (Test D). The existing failure-path tests (missing-vars, fetch-error, extract-error) don't exercise the drain and stay unchanged.

Confirm the chunk sequence by checking `ai@6.0.184`'s `UIMessageChunk` discriminated union for tool-input variants.

- [ ] **Step 11: Run all tests**

Run: `bun run test` from repo root.
Expected: full suite passes — all packages green. Total assertions: existing count + 4 new (`finalize.test.ts`) + ~2 new (`agent.test.ts`'s `tools` + `stopWhen` + `finalize` prompt directive tests).

- [ ] **Step 12: Manually verify the chat UI**

Run the dev server:
```bash
bun --filter @url-cheat-sheet/web dev
```

Visit `http://localhost:5173`, load an RFC URL, ask a question. Confirm the answer renders correctly. If the `@ai-sdk/svelte` `Chat` component doesn't display the `finalize.answer` natively (it might render tool calls as a separate UI block), file a follow-up bd issue for a small renderer — DO NOT block this PR on UI polish, but DO confirm an answer appears somewhere in the thread.

- [ ] **Step 13: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 14: Commit + push**

```bash
git add packages/agent/src/tools/finalize.ts \
  packages/agent/tests/finalize.test.ts \
  packages/agent/src/agent.ts \
  packages/agent/src/prompt.ts \
  packages/agent/tests/agent.test.ts \
  packages/evals/src/providers/agent-provider.ts \
  packages/evals/tests/agent-provider.test.ts
git commit -m "feat(agent): finalize sentinel tool + hasToolCall stop (empty output impossible)"
git push
```

- [ ] **Step 15: Live eval re-run (post-merge)**

Same procedure. Expect 5/5 non-empty outputs. Commit body should cite the κ delta and verify the new finalize-extraction drain works in the wild.

---

## Task 6: architecture-roadmap doc

**Files:**
- Create: `docs/agent-hardening-roadmap.md`

**Acceptance criteria:**

1. File exists at `docs/agent-hardening-roadmap.md`.
2. Six top-level sections (one per Tier 3 idea from the spec), each 150-300 words:
   - § Anthropic Citations API
   - § Multi-grep batch tool
   - § Citation-verifier post-pass
   - § Retrieval planning step
   - § Structured output schema
   - § Top-K reranking on saturated `grep_doc`
3. Each section contains: **What** (one-paragraph description), **Why** (rationale + which failure mode it addresses), **Cost** (effort estimate: small / medium / large), **Improves** (which metric: empty-output rate, citation precision, latency, etc.).
4. A short header at the top of the file: purpose + a pointer to the umbrella spec `docs/specs/2026-05-20-agent-hardening-sweep.md`.
5. Linked from `docs/README.md` if a "roadmap docs" section exists; otherwise standalone.

- [ ] **Step 1: Author the document**

Write the 6 sections per the spec's Tier 3 list. Source material is in `docs/specs/2026-05-20-agent-hardening-sweep.md` § "Tier 3 — backlog (documented, not shipped)". Expand each bullet to a full paragraph; don't add new ideas not in the spec.

- [ ] **Step 2: Cross-check `docs/README.md`**

Check if there's a "roadmap" or "planning docs" section in `docs/README.md`. If yes, add a line linking to the new file. If not, leave the doc standalone.

- [ ] **Step 3: Lint check**

If there's a markdown linter wired into the project, run it. Otherwise skip.

- [ ] **Step 4: Commit + push**

```bash
git add docs/agent-hardening-roadmap.md
git commit -m "docs(agent): Tier 3 hardening roadmap (Citations API, batch grep, verifier, planning, structured output, reranking)"
git push
```

No eval re-run needed — doc-only change.

---

## Self-review

### Spec coverage

| Spec section | Task |
|---|---|
| T1 — temperature: 0 | Task 1 |
| T2 — step budget 5 → 8 | Task 2 |
| T3 — system-prompt rewrite (budget + never-empty + strict Lxx) | Task 3 |
| T4 — tighten grep_doc tool description | Task 4 |
| T5 — finalize sentinel tool + hasToolCall stop | Task 5 |
| T5 stream draining changes (agent-provider, web UI verify) | Task 5 Steps 9-12 |
| T6 — architecture-roadmap doc | Task 6 |
| Eval methodology (κ + suite re-run per merge) | Tasks 1-5 Step 7/8/15 |
| Umbrella acceptance (5/5 non-empty + κ ≥ 0.60) | Task 5 Step 15 |

No gaps.

### Placeholder scan

- No `TBD` / `TODO` / `figure out later`.
- Two "verify against installed types" notes (T5 Step 3 for `tool()` import path; T5 Step 10 for `tool-input-available` chunk shape). These are the project's anti-paste-from-training-data rule, not placeholders.
- T5 Step 12 explicitly accepts "file a follow-up bd if UI needs a renderer" — that's a conditional escape hatch, not a placeholder. Spec acknowledges this risk.

### Type consistency

- `streamText` config object referenced consistently — fields added incrementally (T1 adds `temperature`, T2 modifies `stopWhen`, T5 modifies `tools` + `stopWhen` further).
- `stopWhen` argument: scalar `stepCountIs(5)` in baseline → scalar `stepCountIs(8)` after T2 → array `[stepCountIs(10), hasToolCall('finalize')]` after T5. Step count bumps from 8 to 10 in T5 because finalize itself counts as a tool call (acknowledged in T5 AC 3).
- `finalize` tool shape: same Zod schema mentioned consistently across T5 Steps 1, 3, 9, 10 — `{ answer: string (min 1), citations: string[] (default []) }`.
- Test counts: T1 adds 1, T2 adds 1, T3 adds 3, T4 adds 2, T5 adds ~7 (4 in finalize.test.ts + 2-3 in agent.test.ts + adapted agent-provider tests). No explicit total tracked across the chain — each task verifies its own files.
- Drain helper output shape: `string` throughout. After T5, the string is `answer + ' (citations: ...)'` instead of joined text deltas.
