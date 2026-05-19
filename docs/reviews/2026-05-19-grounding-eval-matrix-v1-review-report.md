# v1 Plan Review Report — grounding-eval-matrix

**Reviewed:** `docs/plans/2026-05-19-grounding-eval-matrix.md` (v1, committed 2026-05-19 on `feat/grounding-eval-matrix`)
**Reviewer:** improving-plans skill, single pass
**Output:** `docs/plans/2026-05-19-grounding-eval-matrix.v2.md`

## Method

Probed `node_modules` for actual installed-package surfaces of the two libraries the plan touches:

- `promptfoo@0.121.11` — custom-provider loader, `ApiProvider` interface, `CallApiContextParams`, `ProviderResponse`.
- `ai@6.0.184` and `@ai-sdk/provider-utils@4.0.27` — UI message stream reading helpers (`readUIMessageStream`, `uiMessageChunkSchema`, `parseJsonEventStream`); `UIMessage` and `UIMessageChunk` shapes.

The probe was the high-leverage step: v1 had two "verify against installed types" placeholders that were exactly the surfaces most likely to drift between training-data and installed reality (ucs-mmj postmortem territory). v2 replaces both placeholders with verified recipes.

## Findings

### 1. Stream-draining API surface pinned (applied to v2)

v1's "Library reference" section listed three candidate approaches with a "verify before using" caveat. The probe confirmed:

- The canonical reader is `readUIMessageStream` from `ai`, which takes `ReadableStream<UIMessageChunk>` (not `Response`, not raw bytes) and yields aggregated `UIMessage` snapshots.
- The bridge from `Response.body` to `ReadableStream<UIMessageChunk>` is `parseJsonEventStream` from `@ai-sdk/provider-utils`, parameterized by `uiMessageChunkSchema` (re-exported from `ai`).
- `parseJsonEventStream` yields `ParseResult<UIMessageChunk>` (success/error union) — must be unwrapped via `TransformStream` before feeding to `readUIMessageStream`.

**Critical gotcha** (now explicit in v2): raw chunks use `{ type: 'text-delta', delta }` but aggregated `TextUIPart` uses `{ type: 'text', text }`. The two layers differ in both discriminator value and field name. Reversing them silently returns `''`.

### 2. Provider constructor signature was missing (applied to v2)

v1 specified `id(): string` returning a literal `'url-cheat-sheet:agent'`. The promptfoo loader actually calls `new (defaultExport)({ ...providerOptions, id: providerId })` — the constructor receives an options object containing `id`. v1's hardcoded `id()` would silently break promptfoo's per-instance id override (used when a YAML provider entry has a custom `id:` label).

v2 adds an explicit constructor that stores `options?.id ?? 'url-cheat-sheet:agent'` and returns it from `id()`. A unit-test case asserts both the supplied-id and default-id paths.

### 3. Return type is `ProviderResponse` (applied to v2)

v1 wrote `Promise<{ output: string } | { error: string }>`. promptfoo's actual interface is `Promise<ProviderResponse>` where `ProviderResponse` has many optional fields (output, error, cost, tokenUsage, raw, metadata, etc.). v1's union is a valid structural subset and works fine at runtime — but v2 references the formal type so the impl agent doesn't accidentally add fields outside the documented shape thinking they're free-form.

### 4. Stream-draining unit-test mock was under-specified (applied to v2)

v1's Test D said "constructs the mock Response from a `ReadableStream` matching the AI SDK v6 UI message stream protocol" — true but unhelpful. The actual protocol requires `text-start`/`text-end` framing chunks bracketing the `text-delta` chunks, plus `start`/`finish` envelope chunks, all SSE-framed (`data: <json>\n\n`). Without the framing, `readUIMessageStream` won't aggregate the deltas into a `TextUIPart` and the test silently produces empty output.

v2 specifies a private `mockUIMessageStreamResponse(deltas: string[])` helper inside the test file, lists the exact chunk sequence (start → start-step → text-start → text-delta ×N → text-end → finish-step → finish), and reminds the impl agent to confirm the exact framing against the installed `UIMessageChunk` union.

### 5. Provider path resolution made portable (applied to v2)

v1 used `file:../../src/providers/agent-provider.ts` (relative to YAML file location). The promptfoo loader resolves this via `context.basePath || process.cwd()` — `basePath` is normally the config-file's directory but the behavior wasn't independently verified. If a future change to `run.ts` (or a CI move to a different cwd) shifts the resolution base, the path silently breaks.

v2 switches to `file:${REPO_ROOT}/packages/evals/src/providers/agent-provider.ts` and adds a small Task 4 to set `process.env.REPO_ROOT` in the spawned promptfoo child env. Task 6 includes an explicit fallback to the relative path if it turns out promptfoo 0.121.11 doesn't expand `${ENV_VAR}` references in YAML config values.

## Items not raised

- **Test scaffolding location.** v1's tests live in `packages/evals/tests/<name>.test.ts`, matching the existing `packages/agent/tests/` pattern. Not changed.
- **Vitest config / discovery.** Root `vitest.config.ts` excludes `node_modules`, `dist`, `build`, `.svelte-kit`, `.claude/plugins`. New tests at `packages/evals/tests/*.test.ts` are picked up by `bun run test`. No change needed.
- **Snapshot overwrites within a day.** `run.ts` writes `docs/evals/<suite>-<YYYY-MM-DD>.md` — running twice in one day overwrites the earlier snapshot. Pre-existing behavior, not a v1 defect. Worth noting if it becomes a problem.
- **`tsconfig.json` for `packages/evals`.** Not inspected. Could be a problem if the new file's imports aren't picked up — surfaced naturally by Task 3's `bun run test` and type-check steps.

## Unresolved questions

- **Does promptfoo 0.121.11 expand `${ENV_VAR}` in YAML config values?** v2 assumes yes (consistent with promptfoo docs in training data) and provides an explicit fallback if it doesn't. Verified at Task 6's live run.
- **Exact SSE framing of `UIMessageChunk` event stream.** v2 specifies the chunk sequence (start, start-step, text-start, text-delta×N, text-end, finish-step, finish) but the on-wire framing (one chunk per `data:` line vs one per record, separators, etc.) is left to impl-time confirmation against the installed `UIMessageChunk` schema. Acceptable — the unit test fails immediately and informatively if it's wrong.
