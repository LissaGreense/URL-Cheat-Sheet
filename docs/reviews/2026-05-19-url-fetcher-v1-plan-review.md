# URL Fetcher Plan — v1 Review Report

**Date:** 2026-05-19
**Plan reviewed:** [`../plans/2026-05-19-url-fetcher.md`](../plans/2026-05-19-url-fetcher.md) (v1)
**Output:** [`../plans/2026-05-19-url-fetcher.v2.md`](../plans/2026-05-19-url-fetcher.v2.md)
**Reviewer:** `improving-plans` skill
**Method:** Read each file the plan modifies in its current state. Compare expected post-task state in the plan against the actual current implementation. Surface mismatches.

---

## Findings (5)

### Finding 1 — `chatRequestSchema` would become strict and break every chat request

**Severity:** critical (would break production behavior at task-merge time)

**Detail:** Plan v1 Task 1 step 3 replaces `chatRequestSchema` with:
```ts
export const ChatRequestSchema = z.strictObject({
  messages: z.array(/* existing UIMessage shape */),
  document: DocumentSchema
});
```

The existing schema (verified in `packages/schemas/src/chat.ts:11`) uses `z.object`, not `z.strictObject`. The comment on the existing schema explicitly explains why: "Top-level uses z.object (strip default) because the AI SDK v6 client also sends a chat-session `id` and a `trigger` discriminator we don't need to consume here." An existing test (`apps/web/tests/chat-route.test.ts:68`, "accepts the @ai-sdk/svelte Chat client payload (id + trigger extras)") asserts this behavior.

Switching to `strictObject` would 400 every chat request from the deployed UI.

**Fix in v2:** Task 1 Step 3 keeps `z.object`. The doc-string explaining the strip-extras rationale is preserved. The `document` field is added to the same schema.

### Finding 2 — Schema naming convention mismatch

**Severity:** medium (cosmetic but propagates through every consumer)

**Detail:** Plan v1 uses PascalCase Zod constant names (`ThreatSchema`, `DocumentSchema`, `ChatRequestSchema`, …). The existing codebase uses camelCase (`chatRequestSchema` at `packages/schemas/src/chat.ts:11`). PascalCase is fine in the abstract, but mixing conventions inside one repo is friction.

**Fix in v2:** All schema constants use camelCase (`threatSchema`, `documentSchema`, `extractRequestSchema`, …). TS type aliases stay PascalCase (`Threat`, `Document`, etc.) per existing pattern. Imports and test files updated consistently.

### Finding 3 — Chat route refactor drops two existing behaviors

**Severity:** high (would silently regress tested behavior)

**Detail:** Plan v1 Task 8 step 3 shows a chat-route handler that:
- Omits the `ANTHROPIC_API_KEY` env check (currently at `apps/web/src/routes/api/chat/+server.ts:23`, returns 500 if missing; tested at `apps/web/tests/chat-route.test.ts:43`).
- Omits the `as UIMessage[]` cast at the call site (currently at `+server.ts:30`).

Both are intentional in the current implementation. The API-key check exists because the project's CLAUDE.md explicitly says env setup is user-managed; a missing-key error must surface as a clean 500, not as an unhelpful Anthropic provider error. The cast bridges Zod's `z.array(z.unknown())` parts to the AI SDK's `UIMessage` type — necessary because the schema validates shape but not the deeper part union.

**Fix in v2:** Task 8 Step 3 shows the full post-refactor handler including the API-key check and the cast. The associated `chat-route.test.ts` update adds explicit test cases for the new `document`-missing 400 and preserves the existing API-key 500 and SDK-extras tests.

### Finding 4 — Eval runner invocation and prompt path are wrong

**Severity:** medium (Task 10 step 2 would fail immediately)

**Detail:** Plan v1 Task 10 runs:
```bash
bun src/run.ts suites/url-grounding/promptfooconfig.yaml
```
The actual runner (`packages/evals/src/run.ts:14`) takes a **suite name** as the positional arg (`process.argv[2]`), then constructs the config path itself: `join(packageRoot, 'suites', suite, 'promptfooconfig.yaml')`. Passing a path would resolve to `packages/evals/suites/suites/url-grounding/promptfooconfig.yaml/promptfooconfig.yaml` and fail.

Additionally, the plan's `promptfooconfig.yaml` references `prompts: - file://../../prompts/url-grounding.txt`. No `prompts/` directory exists under `packages/evals/`. The reference is fabricated.

**Fix in v2:**
- Task 10 invocation: `bun src/run.ts url-grounding`.
- `promptfooconfig.yaml` uses an inline `|` block for prompts instead of a file reference.
- Step 2 documents that the existing runner currently calls the model provider directly (it doesn't plumb `kb_url` into our chat agent); promoting this to a real per-task LLM-graded matrix is a follow-up.

### Finding 5 — Subpath imports won't resolve

**Severity:** high (Task 7 imports would fail at typecheck/build time)

**Detail:** Plan v1 Task 7 imports:
```ts
import { safeFetch } from '@url-cheat-sheet/agent/url/fetch';
import { extractContent } from '@url-cheat-sheet/agent/url/extract';
import { vardScanner } from '@url-cheat-sheet/agent/url/sanitize';
```

`packages/agent/package.json` declares only:
```json
"main": "./src/index.ts",
"exports": { ".": "./src/index.ts" }
```

There's no `exports` map for subpaths, so the bundler/TS resolver will fail. Two options to fix:
- **A.** Re-export `safeFetch`, `extractContent`, `vardScanner` through `packages/agent/src/index.ts`. Consumers import from `@url-cheat-sheet/agent`. Simple.
- **B.** Add an `exports` map to `package.json` declaring each subpath. More verbose. Mirrors real lib publishing.

**Fix in v2 (user picked option A):** Each new module gets re-exported through `packages/agent/src/index.ts` at the end of its respective task (Steps added to Tasks 4, 5, 6). The Task 7 endpoint imports everything from `@url-cheat-sheet/agent` directly.

---

## Out of scope for this review

These were considered but not raised as findings:

- **The vard adapter's `safeParse` API shape.** The Task 6 code calls `detector.safeParse(text)` and reads `result.threats`. The exact API of `@andersmyrmel/vard@1.2.0` may differ — the implementer is instructed in the plan to verify against `node_modules/@andersmyrmel/vard/dist/index.d.ts` post-install. This is correctly flagged in the plan as an implementer note; not a plan defect.
- **AI SDK `prepareSendMessagesRequest` callback name.** Plan v1 already flags this for verification at impl time. v2 keeps that note.
- **Reading bundled `?raw` content into the agent during Task 2.** The plan correctly wires bundled-doc text via a `?raw` import in Task 2's `agent.ts` as a temporary state (replaced in Task 8). Maintains TDD-able state where each task ends with a buildable, testable codebase.
- **Test command pattern (`bunx vitest run`).** Verified consistent across the plan; matches the `"test": "vitest run"` script in package manifests.

---

## Unresolved questions

None. v2 is intended to be implementable as-is. The "implementer notes" in v2 (vard API shape verification, AI SDK callback name verification) are intentional flexpoints for runtime checks against installed dependency types, not unresolved design decisions.
