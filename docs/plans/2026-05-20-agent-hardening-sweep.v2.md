<!-- v2 - 2026-05-20 - Generated via improving-plans from docs/plans/2026-05-20-agent-hardening-sweep.md -->

# Agent Hardening Sweep — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan-writing convention for this repo:** Per `.claude/skills/using-this-repo/SKILL.md` § "Plan-writing conventions", tasks specify signatures, acceptance criteria, and affected files — **not** verbatim implementation bodies. The impl agent reconciles against installed deps and the type-checker.
>
> **Changes from v1:**
> 1. T4: `packages/agent/tests/grep-doc.test.ts` already exists (tests `grepLines` directly); v2 adds description tests to the existing file rather than maybe-creating it.
> 2. T5: `finalize` is explicitly a client-side tool (no `execute`) — confirmed v6-supported.
> 3. T5: drain rewrite is a REPLACEMENT of text-joining with finalize-input extraction (not additive). If the model goes off-script and emits both text and `finalize`, `finalize.answer` wins.
> 4. T5: hardcoded "at most 8 tool calls" in the system prompt is dropped (it was T3's number); T5 replaces it with a `finalize`-driven instruction so prompt stays consistent with `hasToolCall('finalize')` being the primary stop.
> 5. **T5 scope expanded:** the chat UI streams `finalize.answer` progressively via `tool-input-delta` chunks. New steps add the `apps/web` work so the structural fix doesn't ship with a degraded UX. See `docs/reviews/2026-05-20-agent-hardening-sweep-v1-review-report.md` for full review notes.

**Spec:** `docs/specs/2026-05-20-agent-hardening-sweep.md`

**Goal:** Ship 5 cheap agent tunings serially (eval-tested before/after each) plus an architecture-roadmap doc, so the agent never produces empty output and citation precision improves. T5 also preserves progressive streaming UX.

**Architecture:** Five Tier 1+2 tunings — `temperature: 0`, step budget 5→8, system-prompt rewrite, tool description tightening, and a `finalize` sentinel tool — each in its own PR. The sentinel tool (T5) is the structural fix: `hasToolCall('finalize')` becomes the stop condition, making empty output impossible by design. The chat UI streams `finalize.answer` token-by-token via `tool-input-delta` chunks so progressive UX is preserved. T6 ships a markdown roadmap of Tier 3 ideas. Each impl PR re-runs calibration + suite and commits both snapshots, so individual contributions are measurable.

**Tech Stack:** TypeScript, Bun, vitest, AI SDK `ai@6.0.184`, `@ai-sdk/anthropic@3.0.78`, `@ai-sdk/svelte` (chat UI), Anthropic Sonnet 4.6, Zod 4 (`z.strictObject`), `@url-cheat-sheet/agent`, `@url-cheat-sheet/evals`.

---

## File structure

| File | T# | Intent | Responsibility |
|---|---|---|---|
| `packages/agent/src/agent.ts` | T1, T2, T5 | modify | `streamText` config — add `temperature`, bump step count, add `finalize` tool, switch `stopWhen` to array. |
| `packages/agent/src/prompt.ts` | T3, T5 | modify | Rewrite `SYSTEM_PROMPT` with never-empty + strict-Lxx rules. T5 swaps "at most 8 tool calls" for a `finalize`-driven instruction. |
| `packages/agent/src/tools/grep-doc.ts` | T4 | modify | Extend `description` with phrasing guidance + empty-match handling. |
| `packages/agent/src/tools/finalize.ts` | T5 | create | New client-side sentinel tool (no `execute`). |
| `packages/agent/src/index.ts` | T5 | modify | Export `finalize` from package root. |
| `packages/agent/tests/agent.test.ts` | T1, T2, T3, T5 | modify | Tests for new config + prompt rules. |
| `packages/agent/tests/grep-doc.test.ts` | T4 | modify | Add description-content tests (file exists; currently tests `grepLines`). |
| `packages/agent/tests/finalize.test.ts` | T5 | create | Zod schema validation, empty-answer rejection. |
| `packages/evals/src/providers/agent-provider.ts` | T5 | modify | `drainAssistantText` replaces text-joining with `finalize` input extraction. |
| `packages/evals/tests/agent-provider.test.ts` | T5 | modify | Adapt mock helper + happy-path test for finalize-shaped output. |
| `apps/web/src/routes/+page.svelte` | T5 | modify | Stream `finalize.answer` progressively via `tool-input-delta` chunks. |
| `docs/agent-hardening-roadmap.md` | T6 | create | Tier 3 ideas in 1-paragraph bullets each. |
| `docs/evals/grounding-judge-calibration-<date>.md` | T1-T5 | create (auto) | Fresh calibration snapshot per merge. |
| `docs/evals/url-grounding-<date>.md` | T1-T5 | create/overwrite (auto) | Fresh suite snapshot per merge. |

---

## Library reference (verified against installed types)

### AI SDK v6 exports (`ai@6.0.184`)

- `tool({ description, inputSchema })` re-exported from package root. Returns `Tool<INPUT, OUTPUT>` (identity function).
- `tool()` accepts a definition with **no `execute`** — this makes it a client-side tool (model emits the call, no server-side execution). JSDoc explicitly documents this in `@ai-sdk/provider-utils/dist/index.d.ts:1038`: "If not provided, the tool will not be executed automatically."
- `stepCountIs(n)` and `hasToolCall(toolName: string)` both exported from `'ai'`.
- `stopWhen` accepts `StopCondition<TOOLS> | StopCondition<TOOLS>[]`. Array form stops when **any** fires.

### UIMessageChunk tool variants

All carry `toolCallId`. Non-shared fields:

| Variant | Non-shared fields |
|---|---|
| `tool-input-start` | `toolName`, `providerExecuted?`, `dynamic?`, `title?` |
| `tool-input-delta` | `inputTextDelta: string` (NO `toolName` — must track via `toolCallId`) |
| `tool-input-available` | `toolName`, **`input: unknown`** (fully-assembled, parsed), `providerExecuted?` |
| `tool-input-error` | `toolName`, `input: unknown`, `errorText` |
| `tool-output-available` | `output: unknown`, `preliminary?` |
| `tool-output-error` | `errorText` |

**For the evals drain (T5 Step 9):** filter `chunk.type === 'tool-input-available' && chunk.toolName === 'finalize'`, then read `chunk.input` (JSON-parsed). For the **chat UI progressive streaming (T5 Step 12):** track `toolCallId` from the preceding `tool-input-start` whose `toolName === 'finalize'`, then collect `inputTextDelta`s with the matching `toolCallId`.

### Zod 4 (CLAUDE.md hard rule)

Always `z.strictObject({...})`, never `z.object(...).strict()`.

### Current `grep-doc.ts` description (baseline before T4)

```
'Search the loaded document for a case-insensitive substring. Returns
matching lines with up to two lines of surrounding context. Pattern is
treated as literal text, not regex.'
```

### `grep-doc.test.ts` (exists)

Currently tests `grepLines` (pure function): hit count, case-insensitivity, context window, start-of-doc clamping. T4 adds NEW tests for the tool's `description` content, sibling to the existing `grepLines` tests.

---

## Task 1: temperature: 0

**Files:**
- Modify: `packages/agent/src/agent.ts`
- Modify: `packages/agent/tests/agent.test.ts`

**Acceptance criteria:**

1. `streamText` config object in `agent.ts` includes `temperature: 0`.
2. New unit test asserts that the mocked `streamText` call receives `temperature: 0` in its options.
3. `bun run typecheck && bun run lint` clean.
4. Live eval re-run: calibration κ stable within ±0.05 of the 0.80 baseline. Suite snapshot reproducible across two runs (same passes, same citation set).

- [ ] **Step 1: Write the failing test**

In `packages/agent/tests/agent.test.ts`, add a new test mocking `'ai'` (specifically `streamText`), calling `streamChat(messages, document)`, and asserting `vi.mocked(streamText).mock.calls[0][0]` has `temperature: 0`.

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/agent/tests/agent.test.ts`
Expected: new test FAILS (no `temperature` in current config).

- [ ] **Step 3: Implement**

In `packages/agent/src/agent.ts`, add `temperature: 0` to the `streamText` options object alongside `model`, `system`, `messages`, `tools`, `stopWhen`.

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

Commit body: κ delta vs prior, suite pass-count delta, one-line conclusion.

---

## Task 2: bump step budget 5 → 8

**Files:**
- Modify: `packages/agent/src/agent.ts`
- Modify: `packages/agent/tests/agent.test.ts`

**Acceptance criteria:**

1. `stopWhen` argument is `stepCountIs(8)` instead of `stepCountIs(5)`.
2. New unit test asserts `stepCountIs` was called with `8`.
3. Live eval re-run: url-grounding test 2 (HTCPCP-TEA varieties) ships a non-empty answer with at least one `Lxx` citation. Tests 1, 3, 4, 5 do not regress.

- [ ] **Step 1: Write the failing test**

Mock `stepCountIs` from `'ai'`. After calling `streamChat`, assert `vi.mocked(stepCountIs).mock.calls[0][0] === 8`.

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/agent/tests/agent.test.ts`
Expected: new test FAILS.

- [ ] **Step 3: Implement**

Change `stepCountIs(5)` to `stepCountIs(8)` in `packages/agent/src/agent.ts`.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/agent/tests/agent.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 6: Commit + push**

```bash
git add packages/agent/src/agent.ts packages/agent/tests/agent.test.ts
git commit -m "fix(agent): bump tool-call budget 5 → 8 (informational; T5 supersedes)"
git push
```

- [ ] **Step 7: Live eval re-run (post-merge)**

Same procedure as T1. T2's eval signal is informational — the FINAL stopWhen ships in T5 — but the snapshot tells us whether budget alone is enough.

---

## Task 3: system-prompt rewrite

**Files:**
- Modify: `packages/agent/src/prompt.ts`
- Modify: `packages/agent/tests/agent.test.ts`

**Acceptance criteria:**

1. `SYSTEM_PROMPT` includes (in order, top of prompt):
   - Identity/role: "You answer questions about a document the user has loaded."
   - Budget rule: "You have at most 8 tool calls per turn. Reserve at least one step for your final answer — never end a turn without text."
   - Never-empty rule: "Always produce a final answer. If `grep_doc` returns no useful matches after two attempts on related queries, say so honestly — 'I couldn't find this in the document' is a valid answer."
2. Strict citation rule (replaces the current fuzzy example):
   - "Cite line numbers exactly as returned by `grep_doc` in the form `Lxx` (e.g., `L142`, `L228-L231`). Do not estimate or round."
   - "Every factual claim must end with an `Lxx` citation; uncited claims are forbidden."
3. Existing rules preserved: untrusted-data warning about `grep_doc` results, tool usage guidance, "no markdown formatting".
4. Budget rule repeated near the END of the prompt.
5. Existing tests in `agent.test.ts` for prompt content still pass (the rules they check — `grep_doc`, untrusted/data-not-instructions, line numbers, no markdown — are preserved).
6. New tests assert: budget rule present, never-empty rule present, strict Lxx format present.
7. Live eval re-run: calibration κ ≥ 0.80. Suite reasons no longer contain "approximate" / "rounded" qualifiers on citations.

**Note:** the "at most 8 tool calls" number is provisional until T5 ships. T5 replaces this with a `finalize`-driven directive (no hardcoded number) since `hasToolCall('finalize')` becomes the primary stop condition.

- [ ] **Step 1: Write the failing tests**

In `agent.test.ts`'s `describe('SYSTEM_PROMPT', …)` block, add three tests:

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
Expected: 3 new tests FAIL. Existing prompt tests still PASS.

- [ ] **Step 3: Implement**

Rewrite `SYSTEM_PROMPT` in `packages/agent/src/prompt.ts`. Preserve existing rules; add the 3 new ones; repeat the budget rule at the bottom.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/agent/tests/agent.test.ts`
Expected: all SYSTEM_PROMPT tests PASS.

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

Same procedure.

---

## Task 4: tighten `grep_doc` tool description

**Files:**
- Modify: `packages/agent/src/tools/grep-doc.ts` — extend the tool's `description`.
- Modify: `packages/agent/tests/grep-doc.test.ts` (file exists; currently tests `grepLines`) — add description tests as a new `describe` block, leave existing tests intact.

**Acceptance criteria:**

1. `grep_doc` tool description includes (in order):
   - Behavior: "Case-insensitive substring search over document lines, with ±2 lines of context. Returns matching lines labeled `Lxx`."
   - Query guidance: "Use short distinctive substrings — section headings, unique nouns — not full sentences."
   - Empty-match handling: "Empty results mean the term is not in the document; retry at most once with a synonym, then give up and answer honestly."
2. New tests in `grep-doc.test.ts` assert the description includes phrases like "short distinctive substrings" and "retry at most once".
3. Existing `grepLines` tests still pass.
4. Existing behavior unchanged — no signature changes, no API changes. Only `description` grows.

- [ ] **Step 1: Add the failing tests**

In the existing `packages/agent/tests/grep-doc.test.ts`, add a new `describe` block at the bottom:

```ts
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

The existing import for `grepLines` stays untouched. `makeGrepDoc` is the factory that wraps the tool; it's exported from the same module.

- [ ] **Step 2: Run, expect red**

Run: `bunx vitest run packages/agent/tests/grep-doc.test.ts`
Expected: existing `grepLines` tests PASS; new description tests FAIL.

- [ ] **Step 3: Implement**

In `packages/agent/src/tools/grep-doc.ts`, replace the `description` string with the new one per the acceptance criteria. Keep `inputSchema` and the `execute` function untouched.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/agent/tests/grep-doc.test.ts`
Expected: all tests PASS (existing + new).

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 6: Commit + push**

```bash
git add packages/agent/src/tools/grep-doc.ts packages/agent/tests/grep-doc.test.ts
git commit -m "fix(agent): tighten grep_doc tool description with query + empty-match guidance"
git push
```

- [ ] **Step 7: Live eval re-run (post-merge)**

Same procedure. Watch per-test `numRequests` in the snapshot — expect it to trend down vs baseline.

---

## Task 5: `finalize` sentinel tool + `hasToolCall` stop + progressive streaming UI

**Files:**
- Create: `packages/agent/src/tools/finalize.ts`
- Create: `packages/agent/tests/finalize.test.ts`
- Modify: `packages/agent/src/agent.ts`
- Modify: `packages/agent/src/index.ts`
- Modify: `packages/agent/src/prompt.ts`
- Modify: `packages/agent/tests/agent.test.ts`
- Modify: `packages/evals/src/providers/agent-provider.ts`
- Modify: `packages/evals/tests/agent-provider.test.ts`
- Modify: `apps/web/src/routes/+page.svelte`

**Acceptance criteria:**

1. `packages/agent/src/tools/finalize.ts` exports a tool created via `tool({ description, inputSchema })` from `'ai'` with **NO `execute` function** (client-side pattern, confirmed v6-supported per JSDoc at `@ai-sdk/provider-utils/dist/index.d.ts:1038`):
   - `description`: "Emit your final answer. Call this exactly once at the end of your turn. The `answer` field is shown verbatim to the user; the `citations` list is rendered after the answer. Calls with an empty `answer` are rejected."
   - `inputSchema`: `z.strictObject({ answer: z.string().min(1), citations: z.array(z.string()).default([]) })`.
2. `agent.ts` tools map: `{ grep_doc: makeGrepDoc(document.text), finalize }`.
3. `agent.ts` `stopWhen`: `[stepCountIs(10), hasToolCall('finalize')]`. Step count bumped from 8 to 10 because `finalize` itself counts as a tool call.
4. `prompt.ts` updated: **drop** the "at most 8 tool calls" wording from T3 (it conflicts with the new stop condition). Add: "End every turn by calling the `finalize` tool with your answer + citations. Do not produce free-form text outside `finalize`." Keep the never-empty rule, strict Lxx rule, and untrusted-data warning.
5. New unit tests in `finalize.test.ts` (4 assertions):
   - Empty `answer` fails Zod parse.
   - Valid args parse.
   - `citations` defaults to `[]`.
   - Description mentions "exactly once" and "empty".
6. Updated `agent.test.ts`: tools map has both `grep_doc` and `finalize`; `stopWhen` is an array of length 2; new SYSTEM_PROMPT test asserts the `finalize` directive appears.
7. **Updated `agent-provider.ts` drain — REPLACE text-joining with finalize-input extraction** (not additive). Walk the parsed `UIMessageChunk` stream:
   - Find the `tool-input-available` chunk whose `toolName === 'finalize'`.
   - Read `chunk.input` (typed `unknown`; cast to `{ answer: string; citations: string[] }`).
   - Return `answer + (citations.length ? ` (citations: ${citations.join(', ')})` : '')`.
   - If no such chunk in stream → return `''` (budget exhausted without finalize). Judge's ucs-xom guard catches this as fail.
   - Free-form text deltas are IGNORED. If the model goes off-script and emits both text and `finalize`, `finalize.answer` wins.
8. Updated `agent-provider.test.ts` happy-path: new `mockUIMessageStreamFinalizeResponse(answer: string, citations: string[])` helper emits the proper `tool-input-start(toolName: 'finalize')` → `tool-input-delta`×N → `tool-input-available(toolName: 'finalize', input: {answer, citations})` chunk sequence. The expected `output` becomes `answer + (citations.length ? ' (citations: ...)' : '')`.
9. **Updated `apps/web/src/routes/+page.svelte` — progressive streaming of `finalize.answer`:**
   - The `@ai-sdk/svelte` `Chat` component renders messages from the API response. After T5, the model's only "output" is the `finalize` tool call. The default Chat rendering treats this as a tool call, NOT visible chat text.
   - Subscribe to `tool-input-delta` chunks from the active stream. Track which `toolCallId` corresponds to `finalize` (via the preceding `tool-input-start` chunk's `toolName`).
   - For each `tool-input-delta` with the tracked `toolCallId`, append `inputTextDelta` to an in-progress buffer. The deltas are RAW JSON characters of the tool args (e.g., `{"answer": "Hello`, then ` world"`...). Parse incrementally OR display the JSON as-is while streaming, then swap to the clean `answer` when `tool-input-available` fires.
   - Recommended impl: maintain a `streamingFinalize: { raw: string; parsed?: { answer: string; citations: string[] } } | null` reactive state. As deltas arrive, append to `raw`. When `tool-input-available` fires, set `parsed` from `chunk.input`. Render the parsed `answer` if available, else render a "Thinking…" indicator or the raw JSON stream (impl agent's call — pick whichever looks less broken to a human watching).
   - **Acceptance for the UI piece:** when the user asks a question, they see SOME visible progress within ~2 seconds (either streaming-JSON-ish text, a "Thinking…" placeholder, or progressive answer text). Empty silence during the tool loop is NOT acceptable.
10. New tests are added for the apps/web change ONLY if there's an existing test setup that exercises the Chat component (`apps/web/vitest.config.ts` exists; check what's there). Otherwise, this is verified by manual smoke-check in Step 16.
11. `bun run test` from repo root: full suite passes — all packages green.
12. Live eval re-run: url-grounding suite produces non-empty output on ALL 5 tests. Calibration κ ≥ 0.60. (Note: the κ tolerance is looser than T1/T3's ±0.05 because the judge's `output` parameter content shape changes — text now arrives from `finalize.answer`, not free-form text deltas. Re-baseline expected.)
13. Manual smoke-check (Step 16): start dev server, ask a question through the chat UI, confirm progressive visible response.

**Risks:**

- Sonnet may resist calling `finalize` on some prompts despite the prompt directive. The step-budget cap of 10 is the backstop. A budget-exhausted-no-finalize case is now a typed-error scenario; the chat route should map this to a user-visible message ("I couldn't produce an answer after 10 steps"). Filed as a Step 17 follow-up bd if not handled in this PR.
- Calibration κ may shift more than ±0.05. If it drops below 0.60 → STOP and escalate per spec.

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

Create `packages/agent/src/tools/finalize.ts`:

- `import { tool } from 'ai';`
- `import { z } from 'zod';`
- Export `const finalize = tool({...})` with the description + `z.strictObject` inputSchema per AC 1.
- **No `execute` function.** This is intentional — it's a client-side sentinel.

- [ ] **Step 4: Run, expect green**

Run: `bunx vitest run packages/agent/tests/finalize.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Export `finalize` from package root**

Add `export { finalize } from './tools/finalize';` to `packages/agent/src/index.ts`.

- [ ] **Step 6: Wire `finalize` into `agent.ts`**

Update `packages/agent/src/agent.ts`:
- Import: `import { convertToModelMessages, hasToolCall, stepCountIs, streamText, type UIMessage } from 'ai';`
- Import: `import { finalize } from './tools/finalize';`
- Tools map: `tools: { grep_doc: makeGrepDoc(document.text), finalize }`.
- Stop: `stopWhen: [stepCountIs(10), hasToolCall('finalize')]`.
- `temperature: 0` from T1 still in place.

- [ ] **Step 7: Update prompt — drop "at most 8" + add `finalize` directive**

In `packages/agent/src/prompt.ts`:

- **Remove** the "at most 8 tool calls" wording (both occurrences — top and repeat at end).
- **Add** at the bottom: "End every turn by calling the `finalize` tool with your answer + citations. Do not produce free-form text outside `finalize`. The `finalize` tool is REQUIRED to end your turn — without it, your turn fails silently."
- Keep: identity line, never-empty rule, strict Lxx rule, untrusted-data warning, no-markdown rule, tool usage guidance.

The T3 budget-rule test (`/at most 8 tool calls/i`) WILL FAIL after this. Update it to check the new finalize-driven directive instead:

```ts
it('instructs the model to call finalize at the end of every turn', () => {
  expect(SYSTEM_PROMPT.toLowerCase()).toContain('finalize');
  expect(SYSTEM_PROMPT.toLowerCase()).toContain('end every turn');
});
```

Remove the old budget assertion. (T3's never-empty + Lxx tests stay.)

- [ ] **Step 8: Update agent.test.ts for tools + stopWhen + prompt**

Add/modify tests:
- `streamText` called with `tools` containing BOTH `grep_doc` and `finalize`.
- `streamText` called with `stopWhen` that is an array of length 2.
- Old "at most 8 tool calls" prompt test removed; new "finalize directive" test added (per Step 7).

- [ ] **Step 9: Run agent tests, expect green**

Run: `bunx vitest run packages/agent/tests/`
Expected: all PASS.

- [ ] **Step 10: Rewrite `agent-provider.ts` drain**

In `packages/evals/src/providers/agent-provider.ts`:

Replace the current text-joining drain with a finalize-extraction drain:

- Iterate parsed `UIMessageChunk` stream as before.
- Look for `chunk.type === 'tool-input-available' && chunk.toolName === 'finalize'`. When found, cast `chunk.input` to `{ answer: string; citations: string[] }`.
- After stream ends:
  - If finalize chunk was found: return `answer + (citations.length ? ` (citations: ${citations.join(', ')})` : '')`.
  - Else: return `''`.

The previous logic that walked `text-start`/`text-delta`/`text-end` is removed. Free-form text in the stream is ignored.

- [ ] **Step 11: Update agent-provider.test.ts**

- Add a new helper `mockUIMessageStreamFinalizeResponse(answer: string, citations: string[])` co-located in the test file. It emits the SSE-framed sequence:
  - `start`
  - `start-step`
  - `tool-input-start` with `toolCallId: 'call-1'`, `toolName: 'finalize'`
  - `tool-input-delta` chunks (any 1-3 deltas; the test just needs the assembled `input` at the end)
  - `tool-input-available` with `toolCallId: 'call-1'`, `toolName: 'finalize'`, `input: { answer, citations }`
  - `finish-step`
  - `finish`
- Update the existing happy-path test (D) to use this helper. Expected `output` is `answer + (citations.length ? ' (citations: ' + citations.join(', ') + ')' : '')`.
- Failure-path tests (A, B, C, missing-vars) stay unchanged — they never reach the drain.

Confirm the chunk sequence against `node_modules/.bun/ai@6.0.184/.../dist/index.d.ts`'s `UIMessageChunk` union — particularly that `tool-input-available` carries `toolName` and `input` (the probe already confirmed this).

- [ ] **Step 12: Update apps/web for progressive streaming**

In `apps/web/src/routes/+page.svelte`:

- Read the current implementation. The `@ai-sdk/svelte` `Chat` component renders messages.
- Subscribe to incoming stream events. Determine where in the Svelte component you have access to the raw chunk stream — likely via the `transport` prop or a custom `onData` handler. If not directly accessible, you may need to use `useChat`'s lower-level API.
- Track a `streamingFinalize: { raw: string; parsed?: { answer: string; citations: string[] } } | null` reactive state ($state in Svelte 5).
- On `tool-input-start` with `toolName === 'finalize'`: record `toolCallId`, set `streamingFinalize = { raw: '' }`.
- On `tool-input-delta` with the tracked `toolCallId`: `streamingFinalize.raw += chunk.inputTextDelta`.
- On `tool-input-available` with the tracked `toolCallId`: set `streamingFinalize.parsed = chunk.input as { answer, citations }`.
- Render: if `streamingFinalize.parsed` exists, show `parsed.answer + citations`. Else if `streamingFinalize.raw` exists, show the raw JSON characters (or a "Thinking…" placeholder if you prefer — impl agent's call). Else (no finalize yet), show the existing chat thread state.

**If the `@ai-sdk/svelte` Chat component doesn't expose raw chunks easily,** drop down to `fetch('/api/chat', ...)` + manual response-body parsing using the `parseJsonEventStream` recipe from `packages/evals/src/providers/agent-provider.ts`. Reference that file for the parsing pattern.

This is the highest-risk step in T5. If apps/web rework gets out of hand, file a follow-up bd for "polish chat UI streaming" and revert THIS step's changes — the structural agent fix (Steps 1-11) is independently shippable.

- [ ] **Step 13: Smoke-test apps/web**

Run the dev server:
```bash
bun --filter @url-cheat-sheet/web dev
```

Visit `http://localhost:5173`, load an RFC URL, ask a question. Confirm:
- Within ~2 seconds of submitting, SOME progress is visible (streaming JSON, raw text, or progressive answer).
- Final answer renders cleanly when the stream completes.
- Citations appear if the model included them.

If the UI looks broken: revert Step 12, leave a follow-up bd issue noting the UI rework is needed before T5 ships to real users.

- [ ] **Step 14: Run all tests**

Run: `bun run test` from repo root.
Expected: full suite passes.

- [ ] **Step 15: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 16: Commit + push**

```bash
git add packages/agent/src/tools/finalize.ts \
  packages/agent/tests/finalize.test.ts \
  packages/agent/src/agent.ts \
  packages/agent/src/index.ts \
  packages/agent/src/prompt.ts \
  packages/agent/tests/agent.test.ts \
  packages/evals/src/providers/agent-provider.ts \
  packages/evals/tests/agent-provider.test.ts \
  apps/web/src/routes/+page.svelte
git commit -m "feat(agent): finalize sentinel tool + progressive streaming (empty output impossible)"
git push
```

- [ ] **Step 17: Live eval re-run (post-merge)**

Same procedure as T1-T4. Expect 5/5 non-empty outputs. Commit body should cite the κ value, the suite pass-rate, and one-line UX confirmation (progressive streaming worked in manual smoke-check).

If `finalize` is not called on some test → file follow-up bd "agent occasionally skips finalize call" with reproduction.

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
3. Each section: **What** (paragraph), **Why** (rationale + failure mode addressed), **Cost** (small/medium/large), **Improves** (which metric).
4. Short header pointing back to `docs/specs/2026-05-20-agent-hardening-sweep.md`.
5. Linked from `docs/README.md` if a roadmap section exists; else standalone.

- [ ] **Step 1: Author the document**

Write the 6 sections per the spec's Tier 3 list. Source: `docs/specs/2026-05-20-agent-hardening-sweep.md` § "Tier 3 — backlog (documented, not shipped)". Expand each bullet to a full paragraph; don't add new ideas not in the spec.

- [ ] **Step 2: Cross-check `docs/README.md`**

If `docs/README.md` has a "roadmap" or "planning docs" section, add a line. If not, leave standalone.

- [ ] **Step 3: Lint check**

If a markdown linter is wired, run it; else skip.

- [ ] **Step 4: Commit + push**

```bash
git add docs/agent-hardening-roadmap.md
git commit -m "docs(agent): Tier 3 hardening roadmap (Citations API, batch grep, verifier, planning, structured output, reranking)"
git push
```

No eval re-run — doc-only change.

---

## Self-review

### Spec coverage

| Spec section | Task |
|---|---|
| T1 — temperature: 0 | Task 1 |
| T2 — step budget 5 → 8 | Task 2 |
| T3 — system-prompt rewrite | Task 3 |
| T4 — tighten grep_doc description | Task 4 |
| T5 — finalize sentinel tool | Task 5 (Steps 1-11) |
| T5 stream draining changes (evals) | Task 5 Steps 10-11 |
| T5 chat UI progressive streaming | Task 5 Steps 12-13 (added in v2) |
| T6 — architecture-roadmap doc | Task 6 |
| Eval methodology (κ + suite re-run per merge) | Each Task's final Step |
| Umbrella acceptance (5/5 non-empty + κ ≥ 0.60) | Task 5 Step 17 |

No gaps.

### Placeholder scan

- No `TBD` / `TODO` / `figure out later`.
- T5 Step 12's "if apps/web rework gets out of hand, file a follow-up bd and revert this step" is an explicit escape hatch, not a placeholder. The spec acknowledges UI risk.
- T5 Step 17's "if finalize not called on some test → follow-up bd" is a conditional escape hatch for model misbehavior.

### Type consistency

- `streamText` config: fields added incrementally (T1 adds `temperature`, T2 modifies `stopWhen`, T5 modifies `tools` + `stopWhen` further).
- `stopWhen`: scalar `stepCountIs(5)` → scalar `stepCountIs(8)` after T2 → array `[stepCountIs(10), hasToolCall('finalize')]` after T5. Step count bumps 8 → 10 in T5 (finalize counts as a tool call).
- `finalize` schema: same Zod shape across Steps 1, 3, 10, 11 — `{ answer: z.string().min(1), citations: z.array(z.string()).default([]) }`.
- Drain output: `string` throughout. After T5, the string is `answer + ' (citations: ...)'` instead of joined text deltas.
- "at most 8 tool calls" in the prompt: added in T3, REMOVED in T5 Step 7 (replaced by finalize directive). T5 Step 8 removes the corresponding test assertion. v1 didn't flag this — v2 does.
