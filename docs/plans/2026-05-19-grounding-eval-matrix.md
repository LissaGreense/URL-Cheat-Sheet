# Broader URL-Grounding Eval Matrix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan-writing convention for this repo:** Per `.claude/skills/using-this-repo/SKILL.md` § "Plan-writing conventions", tasks specify signatures, acceptance criteria, and affected files — **not** verbatim implementation bodies. The impl agent reconciles against installed deps and the type-checker. See ucs-mmj for the postmortem driving this.

**Spec:** `docs/specs/2026-05-19-grounding-eval-matrix.md`

**Goal:** Wire promptfoo's `url-grounding` suite through the real chat agent (custom provider) and expand the matrix across multiple KB URLs with a layered judge.

**Architecture:** A new TypeScript file `packages/evals/src/providers/agent-provider.ts` implements promptfoo's custom-provider protocol. It calls the existing `safeFetch` → `extractContent` → `streamChat` pipeline in-process, drains the streaming `Response`, and returns the assistant text. The YAML suite swaps its inline-Anthropic provider for `file:` ref to this provider and expands `tests:` across 4 documents with a `defaultTest` rubric.

**Tech Stack:** TypeScript, Bun, vitest, promptfoo `0.121.11`, AI SDK `ai@6.0.184`, `@ai-sdk/anthropic@3.0.78`, `@url-cheat-sheet/agent` (workspace), `@url-cheat-sheet/schemas` (workspace).

---

## File structure

| File | Intent | Responsibility |
|---|---|---|
| `packages/evals/src/providers/agent-provider.ts` | create | Custom promptfoo provider wrapping `safeFetch` + `extractContent` + `streamChat`. Single class default-export. |
| `packages/evals/tests/agent-provider.test.ts` | create | Unit tests with mocked `safeFetch`, `extractContent`, `streamChat`. No network, no API key. |
| `packages/evals/suites/url-grounding/promptfooconfig.yaml` | modify | Swap inline provider for `file:` ref to new provider; expand `tests:`; add `defaultTest` with layered judge. |
| `docs/evals/url-grounding-<YYYY-MM-DD>.md` | create (auto) | Snapshot written by `run.ts` during live verification. Committed alongside impl. |

The provider is the only new source file. The suite YAML is data-driven — new tests are YAML appends, not code changes.

---

## Library reference (do NOT paste verbatim — confirm against installed types)

When the impl agent reaches the stream-draining step in Task 3, check the
installed `ai@6.0.184` package surface for the canonical reader. Likely
candidates documented in the package's `.d.ts`:

- `result.text` (promise of full text) — only if the provider calls
  `streamText` directly, which it does NOT (we call `streamChat`).
- A reader function exported from `ai` that consumes a UI message stream
  `Response` body and yields parts (e.g. `readUIMessageStream`).
- Raw fallback: read `response.body` as `ReadableStream<Uint8Array>`,
  decode line-by-line, parse each line as the UI message stream protocol,
  filter for assistant text deltas.

**Verify the reader name and signature against `node_modules/ai/dist/index.d.ts` before using it.** Do not assume from training data — the AI SDK v6 stream format changed during the v5→v6 transition and the wrong name compiles but returns nothing useful.

The provider's contract (returns `{ output: string }`) does not care which
reader is used, only that the captured text matches what a real client
would render. The unit test (Task 3) pins this behavior with a mocked
`Response`.

---

## Task 1: Provider scaffold (red bar)

**Files:**
- Create: `packages/evals/src/providers/agent-provider.ts`
- Create: `packages/evals/tests/agent-provider.test.ts`

**Signatures to establish:**

```ts
// agent-provider.ts
export default class AgentProvider {
  id(): string;
  callApi(
    prompt: string,
    context: { vars: Record<string, unknown> }
  ): Promise<{ output: string } | { error: string }>;
}
```

`id()` returns the literal string `"url-cheat-sheet:agent"`.

- [ ] **Step 1: Add the failing test for missing-vars handling**

Add a test in `agent-provider.test.ts` that:
- Imports `AgentProvider` (default export) from `../src/providers/agent-provider.ts`.
- Constructs `new AgentProvider()`.
- Calls `callApi('', { vars: {} })` (empty vars).
- Asserts the resolved value matches `{ error: expect.stringMatching(/kb_url|question/i) }`.

Also add a second test in the same file: `id()` returns the string `'url-cheat-sheet:agent'`.

- [ ] **Step 2: Run to confirm red bar**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: FAIL — `Cannot find module '../src/providers/agent-provider.ts'`.

- [ ] **Step 3: Implement the minimal provider to make Step 1 tests pass**

Create `agent-provider.ts` with:
- The `AgentProvider` class with the signature above.
- `id()` returns the literal string.
- `callApi` reads `kb_url` and `question` from `context.vars`. If either is missing or not a string, returns `{ error: <message naming the missing field> }`. No other behavior yet.

Acceptance:
- Both Step 1 tests pass.
- No imports from `@url-cheat-sheet/agent` yet (kept tiny — added in next tasks).

- [ ] **Step 4: Run to confirm green**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/evals/src/providers/agent-provider.ts packages/evals/tests/agent-provider.test.ts
git commit -m "feat(evals): scaffold AgentProvider with vars validation"
```

---

## Task 2: Fetch + extract failure paths

**Files:**
- Modify: `packages/evals/src/providers/agent-provider.ts`
- Modify: `packages/evals/tests/agent-provider.test.ts`

**Library surface to use:**
- `safeFetch(url)` from `@url-cheat-sheet/agent` → `FetchResult` (success has `{ html, contentType, finalUrl, byteSize }`; failure has `error.kind`).
- `extractContent(html, sourceUrl)` from `@url-cheat-sheet/agent` → `ExtractResult { text, title }` or `ExtractError { kind: 'EMPTY_EXTRACTION' | 'PARSE_FAILED' }`.

**Behavior to add to `callApi`:**
1. After var validation, call `safeFetch(kb_url)`.
2. If `fetchResult.ok === false`, return `{ error: ... }` with a message mentioning the failure `kind`.
3. Else call `extractContent(fetchResult.value.html, fetchResult.value.finalUrl)`.
4. If the result has a `kind` field (it's an `ExtractError`), return `{ error: ... }` mentioning the kind.
5. Else continue (next task adds the streamChat call).

Mocking strategy: vitest's `vi.mock('@url-cheat-sheet/agent', ...)` at the top of the test file with mocks for `safeFetch`, `extractContent`, and `streamChat`. Each test uses `vi.mocked(safeFetch).mockResolvedValueOnce(...)` to control the response.

- [ ] **Step 1: Add failing tests for fetch and extract failures**

Add three tests to `agent-provider.test.ts`:

Test A: `callApi` returns `{ error }` when `safeFetch` resolves to `{ ok: false, error: { kind: 'FETCH_TIMEOUT' } }`. Error message should contain `FETCH_TIMEOUT`.

Test B: `callApi` returns `{ error }` when `safeFetch` succeeds but `extractContent` returns `{ kind: 'EMPTY_EXTRACTION' }`. Error message should contain `EMPTY_EXTRACTION`.

Test C: `callApi` returns `{ error }` when `safeFetch` returns `{ ok: false, error: { kind: 'FETCH_BLOCKED_URL', reason: 'private_ip' } }`. Error message should contain `FETCH_BLOCKED_URL` and reasonably surface `private_ip`.

For all three, vars are valid: `{ kb_url: 'https://example.com', question: 'q' }`. `streamChat` should NOT be called — assert that with `expect(vi.mocked(streamChat)).not.toHaveBeenCalled()`.

- [ ] **Step 2: Run to confirm red bar**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: FAIL on the three new tests (provider doesn't call `safeFetch` yet).

- [ ] **Step 3: Implement fetch + extract steps in `callApi`**

Add the behavior described above. Do not call `streamChat` yet — leave a placeholder that returns `{ error: 'streamChat not yet implemented' }` after a successful extract. Keep imports tight (only `safeFetch`, `extractContent`, and the types you need from `@url-cheat-sheet/agent`).

- [ ] **Step 4: Run to confirm green**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: PASS — all 5 tests so far (2 from Task 1 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add packages/evals/src/providers/agent-provider.ts packages/evals/tests/agent-provider.test.ts
git commit -m "feat(evals): AgentProvider surfaces fetch and extract failures"
```

---

## Task 3: Happy path — streamChat + stream draining

**Files:**
- Modify: `packages/evals/src/providers/agent-provider.ts`
- Modify: `packages/evals/tests/agent-provider.test.ts`

**Library surface:**
- `streamChat(messages: UIMessage[], document: Document): Promise<Response>` from `@url-cheat-sheet/agent`.
- `Document` from `@url-cheat-sheet/schemas` — shape: `{ text: string; title: string; sourceUrl: string }`.
- `UIMessage` from `ai`.

**Behavior to add to `callApi`:**
1. After successful `extractContent`, build:
   ```
   document: Document = {
     text: extractResult.text,
     title: extractResult.title,
     sourceUrl: fetchResult.value.finalUrl
   }
   ```
2. Build `messages: UIMessage[]` with one user message containing the question as a text part. **Verify the `UIMessage` part shape against `node_modules/ai/dist/index.d.ts` before constructing — v6 uses `{ role, parts: [{ type: 'text', text }] }` but confirm the exact `type` discriminator.**
3. Call `streamChat(messages, document)` → `response: Response`.
4. Drain the response body, collecting assistant text deltas into a single string. See "Library reference" at the top of this plan for which `ai` reader to use; verify against installed types.
5. Return `{ output: text }`.

- [ ] **Step 1: Add failing tests for the happy path**

Add tests to `agent-provider.test.ts`:

Test D: `callApi` with valid vars and mocked successful fetch + extract + a mocked `streamChat` that returns a `Response` whose body emits two text deltas ("Hello " and "world") returns `{ output: 'Hello world' }`. (The test constructs the mock `Response` from a `ReadableStream` matching the AI SDK v6 UI message stream protocol. Confirm the on-wire format against `node_modules/ai` before writing — the test will fail if the format is wrong, which IS the signal.)

Test E: `callApi` passes the expected `Document` shape to `streamChat`. Use `vi.mocked(streamChat).mock.calls[0][1]` to assert `{ text, title, sourceUrl }` matches what the mocked `extractContent` and `safeFetch` produced.

Test F: `callApi` passes a `UIMessage[]` with exactly one user message containing the question text to `streamChat`. Assert via `vi.mocked(streamChat).mock.calls[0][0]`.

- [ ] **Step 2: Run to confirm red bar**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: FAIL on tests D–F.

- [ ] **Step 3: Implement the happy path**

Implement steps 1–5 from "Behavior to add" above. Use the AI SDK stream reader confirmed at the top of this plan. Do not paste a reader implementation from memory.

- [ ] **Step 4: Run to confirm green**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: PASS — all 8 tests (2 + 3 + 3).

- [ ] **Step 5: Type-check and root tests**

Run: `bun run test` from repo root.
Expected: full suite passes (no regressions in other packages).

Run: `bunx tsc -b` (or the equivalent root build command — check `package.json` scripts).
Expected: clean type-check.

- [ ] **Step 6: Commit**

```bash
git add packages/evals/src/providers/agent-provider.ts packages/evals/tests/agent-provider.test.ts
git commit -m "feat(evals): AgentProvider drains streamChat into provider output"
```

---

## Task 4: Update the `url-grounding` suite YAML

**Files:**
- Modify: `packages/evals/suites/url-grounding/promptfooconfig.yaml`

**Spec source:** `docs/specs/2026-05-19-grounding-eval-matrix.md` § "Suite shape".

**Acceptance criteria:**

1. `providers:` lists a single entry: `id: file:../../src/providers/agent-provider.ts`. **Confirm the relative path resolves correctly from the YAML's location** — promptfoo resolves `file:` refs relative to the config file. Use `bun packages/evals/src/run.ts url-grounding` to verify (will fail downstream on missing key, but provider must load).
2. `prompts:` is a single-line placeholder: `"{{question}}"`. The provider ignores `prompt` and reads from `vars` directly.
3. `defaultTest.assert` contains exactly two entries: a `regex` for `L\d+` and an `llm-rubric` with the rubric text from the spec.
4. `defaultTest.options.provider` is `anthropic:messages:claude-haiku-4-5`.
5. `tests:` contains the 5 test entries listed in the spec (2 × RFC 2324, 1 × RFC 7168, 1 × Wikipedia HTCPCP, 1 × Wikipedia HTTP 418). Each entry has `description`, `vars: { kb_url, question }`, and optional per-test `assert` for keyword anchors (`contains: '418'`, `contains: 'Hyper Text Coffee Pot Control Protocol'`, `contains: '2324'`).
6. The existing header comment (the 17-line block explaining the old scaffold limitation) is removed or replaced by a one-line `description:` updated to reflect the new reality. The misleading old comment must not survive in the file.

- [ ] **Step 1: Update the YAML to match the spec**

Apply all 6 acceptance criteria. Use the spec's "Suite shape" block as the literal target.

- [ ] **Step 2: Sanity-check by loading the suite (no live run yet)**

Run: `bunx promptfoo validate -c packages/evals/suites/url-grounding/promptfooconfig.yaml` if the subcommand exists in promptfoo 0.121.11 — if not, skip this step and rely on Task 5's live run as the validation.

- [ ] **Step 3: Commit**

```bash
git add packages/evals/suites/url-grounding/promptfooconfig.yaml
git commit -m "feat(evals): expand url-grounding suite to broader matrix via custom provider"
```

---

## Task 5: Live verification + snapshot

**Files:**
- Create (auto): `docs/evals/url-grounding-<YYYY-MM-DD>.md`

**Pre-flight:** `ANTHROPIC_API_KEY` must be set in `.env` at repo root. Per `CLAUDE.md` "Always do first" item 5: if `.env` is missing or empty, **stop and ask the user to populate it**. Do not modify `.env`.

- [ ] **Step 1: Confirm the API key is available**

Run: `test -s .env && grep -q '^ANTHROPIC_API_KEY=' .env && echo OK || echo MISSING`
Expected: `OK`. If `MISSING`, stop and ask the user.

- [ ] **Step 2: Run the suite**

Run: `bun packages/evals/src/run.ts url-grounding`
Expected: command exits 0. Snapshot file `docs/evals/url-grounding-<today>.md` is created. The snapshot's `json` block contains per-test grading output for all 5 tests.

If the run fails (provider error, schema mismatch, exhausted tokens), debug and fix — but do NOT loosen the suite to make it pass. The matrix is the measurement; a failing test means the agent has a real grounding issue worth knowing about.

- [ ] **Step 3: Inspect the snapshot**

Open the generated snapshot and confirm:
- Each of the 5 test entries appears in the JSON.
- At least the regex `L\d+` assertion has meaningful pass/fail signal across tests (any pass at all means the agent produced citation-style line refs).
- LLM-rubric results have a `score`, `reason`, and `pass` field per test.

Full pass is NOT required. Document any consistent failure pattern in the commit message — that's the signal we built this for.

- [ ] **Step 4: Commit the snapshot**

```bash
git add docs/evals/url-grounding-*.md
git commit -m "test(evals): first live snapshot of broader url-grounding matrix"
```

If failures are present and informative, mention them in the commit body (one-line summary). If everything passes cleanly, say so plainly — the spec accepts either outcome.

---

## Self-review

### Spec coverage

| Spec section | Task |
|---|---|
| Provider contract (callApi signature) | Tasks 1–3 |
| Provider error paths (fetch + extract) | Task 2 |
| Provider happy path (streamChat drain) | Task 3 |
| Suite YAML changes (provider ref, defaultTest, matrix) | Task 4 |
| Provider unit test (5 cases listed in spec) | Tasks 1–3 cover all 5 (missing-vars, extract-error, drain, message-shape, document-shape) |
| Live run + snapshot | Task 5 |
| Header comment cleanup | Task 4 acceptance criterion 6 |
| Acceptance criterion 6 (TBD URL replaced) | Already replaced in spec — no separate task needed |

No gaps.

### Placeholder scan

No `TBD` / `TODO` / `figure it out later` in the plan body. Two explicit
"verify against installed types" notes — these are the project's
anti-paste-from-training-data rule, not placeholders.

### Type consistency

`Document` shape used consistently across tasks: `{ text, title, sourceUrl }`.
`UIMessage` shape: deferred to impl-time verification (intentional per
ucs-mmj).
Provider return shape: `{ output: string } | { error: string }` throughout.
Test counts: 2 (Task 1) + 3 (Task 2) + 3 (Task 3) = 8 total, matches the
"all 8 tests" claim in Task 3 Step 4.
