<!-- v2 - 2026-05-19 - Generated via improving-plans from docs/plans/2026-05-19-grounding-eval-matrix.md -->

> **Post-impl corrigendum (2026-05-20, ucs-zvf):** Two assumptions in this plan
> were wrong and got fixed during Task 6 of the implementation:
>
> 1. **`${REPO_ROOT}` interpolation does NOT work in promptfoo 0.121.11.** The
>    runner sets the env var, but promptfoo treats `${REPO_ROOT}` literally in
>    YAML config values. Task 4's runner change is dead code (tracked as
>    `ucs-dnt` for cleanup).
> 2. **The relative-path fallback documented below as `file:../../...` is also
>    wrong** — promptfoo's loader at `dist/src/providers-am7xTa5w.js:23387`
>    only strips `file://` (two slashes). The working form is
>    **`file://../../src/providers/agent-provider.ts`** (two slashes, relative
>    to the config file's directory). This was the form ultimately shipped in
>    `packages/evals/suites/url-grounding/promptfooconfig.yaml`.
>
> The body below preserves what the plan said at authoring time so the
> reasoning is auditable; the actual implementation deviated as described
> here. Future plans should use `file://<relative-or-absolute-path>` for
> promptfoo file references, full stop.

# Broader URL-Grounding Eval Matrix — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan-writing convention for this repo:** Per `.claude/skills/using-this-repo/SKILL.md` § "Plan-writing conventions", tasks specify signatures, acceptance criteria, and affected files — **not** verbatim implementation bodies. The impl agent reconciles against installed deps and the type-checker. See ucs-mmj for the postmortem driving this.
>
> **Changes from v1:** Stream-draining API names pinned after probing `node_modules` (verified, not guessed). Provider constructor signature added (promptfoo calls `new`). Provider path switched to env-var interpolation. Test for stream draining specified as hand-rolled SSE in a `ReadableStream`. See `docs/reviews/2026-05-19-grounding-eval-matrix-v1-review-report.md` for the full review notes.

**Spec:** `docs/specs/2026-05-19-grounding-eval-matrix.md`

**Goal:** Wire promptfoo's `url-grounding` suite through the real chat agent (custom provider) and expand the matrix across multiple KB URLs with a layered judge.

**Architecture:** A new TypeScript file `packages/evals/src/providers/agent-provider.ts` implements promptfoo's custom-provider protocol. It calls the existing `safeFetch` → `extractContent` → `streamChat` pipeline in-process, drains the streaming `Response` using AI SDK v6 readers, and returns the assistant text. The YAML suite swaps its inline-Anthropic provider for a `file:` ref to this provider (resolved via `${REPO_ROOT}` env var, set by `run.ts`) and expands `tests:` across 4 documents with a `defaultTest` rubric.

**Tech Stack:** TypeScript, Bun, vitest, promptfoo `0.121.11`, AI SDK `ai@6.0.184`, `@ai-sdk/anthropic@3.0.78`, `@ai-sdk/provider-utils@4.0.27`, `@url-cheat-sheet/agent` (workspace), `@url-cheat-sheet/schemas` (workspace).

---

## File structure

| File | Intent | Responsibility |
|---|---|---|
| `packages/evals/src/providers/agent-provider.ts` | create | Custom promptfoo provider wrapping `safeFetch` + `extractContent` + `streamChat`. Default-export class. |
| `packages/evals/tests/agent-provider.test.ts` | create | Unit tests with mocked `safeFetch`, `extractContent`, `streamChat`. No network, no API key. |
| `packages/evals/src/run.ts` | modify | Set `process.env.REPO_ROOT` before spawning promptfoo so the suite's `file:${REPO_ROOT}/...` provider ref resolves portably. |
| `packages/evals/suites/url-grounding/promptfooconfig.yaml` | modify | Swap inline provider for `file:${REPO_ROOT}/packages/evals/src/providers/agent-provider.ts`; expand `tests:`; add `defaultTest` with layered judge. |
| `docs/evals/url-grounding-<YYYY-MM-DD>.md` | create (auto) | Snapshot written by `run.ts` during live verification. Committed alongside impl. |

The provider is the only new source file. The suite YAML is data-driven — new tests are YAML appends, not code changes.

---

## Library reference (verified against installed types — apply as written)

These names and shapes were extracted from `node_modules/.bun/promptfoo@0.121.11/.../dist/src/index.d.ts` and `node_modules/.bun/ai@6.0.184/.../dist/index.d.ts` on 2026-05-19. If the lockfile pins these exact versions and the impl runs against them, the names below are authoritative. If versions change, re-probe.

### promptfoo custom-provider contract

```ts
interface ApiProvider {
  id: () => string;                     // method, not a static property
  callApi: (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ) => Promise<ProviderResponse>;
}

interface CallApiContextParams {
  vars: Record<string, VarValue>;       // test row's vars (required when context is supplied)
  prompt: Prompt;                       // metadata; first arg is the rendered string
  // …many other optional fields we don't use
}

interface ProviderResponse {
  output?: string | any;
  error?: string;
  // …many other optional fields we don't use
}
```

**Loader behavior:** promptfoo loads `file:` providers by calling `new (defaultExport)({ ...providerOptions, id: providerId })`. The constructor receives a single argument — an options object that always contains `id` (string). Our provider must:

- Be a `default export class`.
- Accept a constructor argument of shape `{ id?: string }` (other options ignored).
- Store the id and return it from `id()`. If the option is missing, fall back to the literal `'url-cheat-sheet:agent'`.

### AI SDK v6 stream draining recipe

```ts
import { readUIMessageStream, uiMessageChunkSchema, type UIMessage, type UIMessageChunk } from 'ai';
import { parseJsonEventStream } from '@ai-sdk/provider-utils';

// response: Response — body is the UI message event stream
const parsed = parseJsonEventStream({
  stream: response.body!,
  schema: uiMessageChunkSchema,
}); // ReadableStream<ParseResult<UIMessageChunk>>

const chunks = parsed.pipeThrough(
  new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
    transform(p, ctrl) { if (p.success) ctrl.enqueue(p.value); },
  })
);

let last: UIMessage | undefined;
for await (const msg of readUIMessageStream({ stream: chunks })) {
  last = msg;
}
const output = (last?.parts ?? [])
  .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
  .map(p => p.text)
  .join('');
```

**Critical naming gotcha to internalize:**

| | type discriminator | text field |
|---|---|---|
| Raw `UIMessageChunk` (from the wire) | `'text-delta'` | `delta` |
| Aggregated `TextUIPart` (in `UIMessage.parts`) | `'text'` | `text` |

`readUIMessageStream` yields aggregated `UIMessage` snapshots, not raw chunks — so the consumer code uses the `'text'` / `text` form. Reverse them and the join silently returns `''`.

### UIMessage shape for the input (user) message

```ts
const messages: UIMessage[] = [
  {
    id: '<any string>',             // e.g. crypto.randomUUID() or 'q-1'
    role: 'user',
    parts: [{ type: 'text', text: question }],
  },
];
```

**`id` is required** on `UIMessage` — easy to forget; TS will catch it.

---

## Task 1: Provider scaffold (red bar)

**Files:**
- Create: `packages/evals/src/providers/agent-provider.ts`
- Create: `packages/evals/tests/agent-provider.test.ts`

**Signatures to establish:**

```ts
// agent-provider.ts
import type { ApiProvider, CallApiContextParams, ProviderResponse } from 'promptfoo';

export default class AgentProvider implements ApiProvider {
  private readonly providerId: string;
  constructor(options?: { id?: string }) {
    this.providerId = options?.id ?? 'url-cheat-sheet:agent';
  }
  id(): string { return this.providerId; }
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    // …
  }
}
```

(Type imports from `'promptfoo'` may need to come from a subpath — confirm against the installed `package.json` `exports` map. If `'promptfoo'` doesn't expose them at the root, inline equivalents using `Record<string, unknown>` for `vars` and the documented shape for `ProviderResponse` are acceptable.)

- [ ] **Step 1: Add the failing tests**

Add two tests in `agent-provider.test.ts`:

1. `id()` returns the constructor-supplied id when one is passed: `new AgentProvider({ id: 'custom-id' }).id()` returns `'custom-id'`.
2. `id()` returns `'url-cheat-sheet:agent'` when no constructor argument is passed.
3. `callApi('', { vars: {}, prompt: { raw: '', label: '' } })` resolves to a `ProviderResponse` with an `error` field matching `/kb_url|question/i`.

(That's 3 assertions — group as 2 `it` blocks if you want, but each assertion above counts toward the "8 tests by end of Task 3" tally.)

- [ ] **Step 2: Run to confirm red bar**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: FAIL — `Cannot find module '../src/providers/agent-provider.ts'`.

- [ ] **Step 3: Implement the minimal provider**

Create `agent-provider.ts` per the signature above. `callApi` reads `kb_url` and `question` from `context?.vars`. If `context` is undefined, or either var is missing or not a string, return `{ error: <message naming the missing field> }`. No other behavior yet.

Acceptance:
- All Step 1 assertions pass.
- No imports from `@url-cheat-sheet/agent` yet — kept tiny.

- [ ] **Step 4: Run to confirm green**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: PASS (3 assertions).

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

**Mocking strategy:** vitest's `vi.mock('@url-cheat-sheet/agent', ...)` at the top of the test file with mocks for `safeFetch`, `extractContent`, and `streamChat`. Each test uses `vi.mocked(safeFetch).mockResolvedValueOnce(...)` to control the response.

- [ ] **Step 1: Add failing tests for fetch and extract failures**

Add three tests to `agent-provider.test.ts`:

Test A: `safeFetch` resolves to `{ ok: false, error: { kind: 'FETCH_TIMEOUT' } }` → `callApi` returns `{ error }` containing `'FETCH_TIMEOUT'`.

Test B: `safeFetch` succeeds but `extractContent` returns `{ kind: 'EMPTY_EXTRACTION' }` → `callApi` returns `{ error }` containing `'EMPTY_EXTRACTION'`.

Test C: `safeFetch` returns `{ ok: false, error: { kind: 'FETCH_BLOCKED_URL', reason: 'private_ip' } }` → `callApi` returns `{ error }` containing both `'FETCH_BLOCKED_URL'` and `'private_ip'`.

For all three:
- vars: `{ kb_url: 'https://example.com', question: 'q' }`.
- `context.prompt` can be a stub: `{ raw: '', label: '' }`.
- Assert `streamChat` was NOT called: `expect(vi.mocked(streamChat)).not.toHaveBeenCalled()`.

- [ ] **Step 2: Run to confirm red bar**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: FAIL on tests A–C.

- [ ] **Step 3: Implement fetch + extract steps**

Add the behavior above. Do not call `streamChat` yet — leave a placeholder returning `{ error: 'streamChat not yet implemented' }` after a successful extract. Keep imports tight.

- [ ] **Step 4: Run to confirm green**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: PASS — 6 assertions total (3 + 3).

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
- `UIMessage`, `readUIMessageStream`, `uiMessageChunkSchema` from `ai`.
- `parseJsonEventStream` from `@ai-sdk/provider-utils`.

**Behavior to add to `callApi`:**
1. After successful `extractContent`, build the `Document`:
   ```
   document: Document = {
     text: extractResult.text,
     title: extractResult.title,
     sourceUrl: fetchResult.value.finalUrl,
   }
   ```
2. Build `messages: UIMessage[]` with one user message — see "UIMessage shape for the input (user) message" in the Library reference. **Don't omit `id`** — it's required.
3. Call `streamChat(messages, document)` → `response: Response`.
4. Drain the response body using the verified recipe in the Library reference. Take the *last* yielded `UIMessage`, filter `parts` where `type === 'text'`, map to `.text`, join.
5. Return `{ output: text }`.

- [ ] **Step 1: Add a small test helper for the mock stream**

Add a private helper inside `agent-provider.test.ts` (NOT a separate file — keep test scaffolding co-located):

```ts
// Builds a Response whose body is a UI message event stream emitting the
// given deltas as text-delta chunks framed by text-start/text-end. The
// on-wire format matches what `result.toUIMessageStreamResponse()` produces.
function mockUIMessageStreamResponse(deltas: string[]): Response {
  // Implementation: encode each chunk as `data: <json>\n\n` (SSE) for
  //   1. { type: 'start' }
  //   2. { type: 'start-step' }
  //   3. { type: 'text-start', id: 't1' }
  //   4… { type: 'text-delta', id: 't1', delta }  ×N
  //   N+4. { type: 'text-end', id: 't1' }
  //   N+5. { type: 'finish-step' }
  //   N+6. { type: 'finish' }
  // Wrap in a ReadableStream<Uint8Array> via TextEncoder.
  // Return new Response(stream, { headers: { 'content-type': 'text/event-stream' } }).
}
```

**Confirm the exact framing** by inspecting `node_modules/.bun/ai@6.0.184/.../dist/index.d.ts` for `UIMessageChunk` variants. The `text-start` / `text-end` framing is required — `text-delta` chunks alone won't aggregate into a `TextUIPart` without their bookends.

- [ ] **Step 2: Add failing tests for the happy path**

Add three tests to `agent-provider.test.ts`:

Test D: Mocked `safeFetch` → success; mocked `extractContent` → `{ text: 'doc text', title: 'T' }`; mocked `streamChat` → `mockUIMessageStreamResponse(['Hello ', 'world'])`. `callApi(...)` resolves to `{ output: 'Hello world' }`.

Test E: Same setup as D. After awaiting `callApi`, assert via `vi.mocked(streamChat).mock.calls[0][1]` that the passed `Document` equals `{ text: 'doc text', title: 'T', sourceUrl: <finalUrl from mocked safeFetch> }`.

Test F: Same setup. Assert via `vi.mocked(streamChat).mock.calls[0][0]` that the passed `messages` is an array of length 1, with `role: 'user'`, exactly one `parts` entry of `{ type: 'text', text: <question> }`, and a non-empty `id`.

- [ ] **Step 3: Run to confirm red bar**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: FAIL on tests D–F.

- [ ] **Step 4: Implement the happy path**

Implement behavior steps 1–5 above using the Library reference recipe. Do not paste a stream reader from memory — the verified recipe is at the top of this plan.

- [ ] **Step 5: Run to confirm green**

Run: `bunx vitest run packages/evals/tests/agent-provider.test.ts`
Expected: PASS — 9 assertions total (3 + 3 + 3).

- [ ] **Step 6: Type-check and root tests**

Run: `bun run test` from repo root.
Expected: full suite passes (no regressions in other packages).

Run the workspace TypeScript build — check `package.json` `scripts` at repo root for the canonical command (likely `bun run build` or `bunx tsc -b`).
Expected: clean type-check.

- [ ] **Step 7: Commit**

```bash
git add packages/evals/src/providers/agent-provider.ts packages/evals/tests/agent-provider.test.ts
git commit -m "feat(evals): AgentProvider drains streamChat into provider output"
```

---

## Task 4: Wire `REPO_ROOT` env var in the runner

**Files:**
- Modify: `packages/evals/src/run.ts`

The runner already computes `repoRoot` (line 10). Before calling `spawnSync('bunx', ['promptfoo', ...], ...)`, expose it to the spawned promptfoo process via env so the YAML's `file:${REPO_ROOT}/...` resolves portably regardless of cwd.

- [ ] **Step 1: Update `run.ts`**

Modify the `spawnSync` call to pass an explicit `env` that extends `process.env` with `REPO_ROOT: repoRoot`. Single-line change inside the existing call's options object.

Acceptance:
- `process.env` of the parent is preserved (so `ANTHROPIC_API_KEY` still propagates from `.env`).
- `REPO_ROOT` is set to the absolute path of the repo root in the child env.

- [ ] **Step 2: Smoke-check that REPO_ROOT propagates**

This is fastest verified at Task 5's live run, but a tiny standalone check is cheap: temporarily add `console.log('REPO_ROOT='+process.env.REPO_ROOT);` to the YAML's `description:` or to a custom provider stub — or just trust Task 5. Recommend skipping this step and validating at Task 5.

- [ ] **Step 3: Commit**

```bash
git add packages/evals/src/run.ts
git commit -m "feat(evals): runner exposes REPO_ROOT for portable provider paths"
```

---

## Task 5: Update the `url-grounding` suite YAML

**Files:**
- Modify: `packages/evals/suites/url-grounding/promptfooconfig.yaml`

**Spec source:** `docs/specs/2026-05-19-grounding-eval-matrix.md` § "Suite shape".

**Acceptance criteria:**

1. `providers:` lists a single entry: `id: file:${REPO_ROOT}/packages/evals/src/providers/agent-provider.ts`. promptfoo expands `${ENV_VAR}` references in YAML config values. **If env-var expansion does not work in promptfoo 0.121.11** (verified at Task 6's live run), fall back to a relative path `file:../../src/providers/agent-provider.ts` — promptfoo's loader joins this with `context.basePath`, which is normally the config file's directory.
2. `prompts:` is a single-line placeholder: `"{{question}}"`. The provider ignores `prompt` and reads from `vars` directly.
3. `defaultTest.assert` contains exactly two entries: a `regex` for `L\d+` and an `llm-rubric` with the rubric text from the spec.
4. `defaultTest.options.provider` is `anthropic:messages:claude-haiku-4-5`.
5. `tests:` contains the 5 test entries listed in the spec (2 × RFC 2324, 1 × RFC 7168, 1 × Wikipedia HTCPCP, 1 × Wikipedia HTTP 418). Each entry has `description`, `vars: { kb_url, question }`, and optional per-test `assert` for keyword anchors (`contains: '418'`, `contains: 'Hyper Text Coffee Pot Control Protocol'`, `contains: '2324'`).
6. The existing header comment (the 17-line block explaining the old scaffold limitation) is removed or replaced by a one-line `description:` reflecting the new reality. The misleading old comment must not survive in the file.

- [ ] **Step 1: Update the YAML to match the spec**

Apply all 6 acceptance criteria. Use the spec's "Suite shape" block as the literal target, with the provider id changed to use `${REPO_ROOT}`.

- [ ] **Step 2: Sanity-check by loading the suite (no live run yet)**

Run: `bunx promptfoo validate -c packages/evals/suites/url-grounding/promptfooconfig.yaml` if the subcommand exists in promptfoo 0.121.11 — if not (`unknown command 'validate'`), skip this step and rely on Task 6's live run as the validation.

- [ ] **Step 3: Commit**

```bash
git add packages/evals/suites/url-grounding/promptfooconfig.yaml
git commit -m "feat(evals): expand url-grounding suite to broader matrix via custom provider"
```

---

## Task 6: Live verification + snapshot

**Files:**
- Create (auto): `docs/evals/url-grounding-<YYYY-MM-DD>.md`

**Pre-flight:** `ANTHROPIC_API_KEY` must be set in `.env` at repo root. Per `CLAUDE.md` "Always do first" item 5: if `.env` is missing or empty, **stop and ask the user to populate it**. Do not modify `.env`.

- [ ] **Step 1: Confirm the API key is available**

Run: `test -s .env && grep -q '^ANTHROPIC_API_KEY=' .env && echo OK || echo MISSING`
Expected: `OK`. If `MISSING`, stop and ask the user.

- [ ] **Step 2: Run the suite**

Run: `bun packages/evals/src/run.ts url-grounding`
Expected: command exits 0. Snapshot file `docs/evals/url-grounding-<today>.md` is created. The snapshot's `json` block contains per-test grading output for all 5 tests.

**If the provider fails to load** (e.g. `Cannot find module ...${REPO_ROOT}...`), promptfoo did not expand the env var. Apply the fallback per Task 5 acceptance criterion 1: change the YAML provider id to `file:../../src/providers/agent-provider.ts` and re-run.

**If the run fails** for other reasons (schema mismatch, exhausted tokens), debug and fix — but do NOT loosen the suite to make it pass. The matrix is the measurement; a failing test means the agent has a real grounding issue worth knowing about.

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
| Runner REPO_ROOT plumbing | Task 4 (new in v2) |
| Suite YAML changes (provider ref, defaultTest, matrix) | Task 5 |
| Provider unit test (5 cases listed in spec) | Tasks 1–3 cover all 5 (missing-vars, extract-error, drain, message-shape, document-shape) |
| Live run + snapshot | Task 6 |
| Header comment cleanup | Task 5 acceptance criterion 6 |
| Acceptance criterion 6 (TBD URL replaced) | Already replaced in spec — no separate task needed |

No gaps.

### Placeholder scan

No `TBD` / `TODO` / `figure it out later` in the plan body. The "Library reference" section now contains verified-against-`node_modules` recipes, not "candidates to check". Two narrow impl-time verifications remain (the exact SSE framing for `mockUIMessageStreamResponse`, and whether promptfoo expands `${ENV_VAR}` in 0.121.11) — both have explicit fallbacks specified.

### Type consistency

- `Document` shape used consistently across tasks: `{ text, title, sourceUrl }`.
- `UIMessage` input shape pinned in Library reference: `{ id, role: 'user', parts: [{ type: 'text', text }] }`.
- `UIMessageChunk` (wire) vs `TextUIPart` (aggregated) discriminators called out in the critical-gotcha table.
- Provider return shape: `Promise<ProviderResponse>` (with `output?` and `error?` set as appropriate).
- Test counts: 3 (Task 1) + 3 (Task 2) + 3 (Task 3) = 9 assertions, matches the "9 assertions total" claim in Task 3 Step 5.
