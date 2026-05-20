# v1 Plan Review Report — agent-hardening-sweep

**Reviewed:** `docs/plans/2026-05-20-agent-hardening-sweep.md` (v1, committed 2026-05-20 on `feat/agent-hardening-sweep`)
**Reviewer:** improving-plans skill, single pass
**Output:** `docs/plans/2026-05-20-agent-hardening-sweep.v2.md`

## Method

Probed `node_modules/.bun/ai@6.0.184/` and `@ai-sdk/provider-utils@4.0.27/`
for the exact API surfaces v1 assumed (`tool()`, `hasToolCall`, the
`UIMessageChunk` tool-* variants, client-side tools without `execute`).
Also read the current state of `packages/agent/src/tools/grep-doc.ts` and
checked whether `packages/agent/tests/grep-doc.test.ts` exists.

The probe confirmed v1's high-level assumptions but surfaced 5 precision
issues + one user-facing UX question.

## Findings

### 1. `grep-doc.test.ts` already exists (applied to v2)

v1 said "Modify `packages/agent/tests/grep-doc.test.ts` if it exists
(otherwise create)". The probe confirmed it exists — currently tests
`grepLines` (the pure function) directly, NOT the tool wrapper. v2 makes
T4 explicit: ADD a new `describe` block for tool description tests as a
sibling to the existing `grepLines` tests; do NOT create the file.

### 2. `finalize` is a client-side tool (applied to v2)

v1's T5 acceptance criteria didn't explicitly call out the absence of
`execute`. The probe confirmed AI SDK v6 supports tools without an
`execute` function — JSDoc at `@ai-sdk/provider-utils/dist/index.d.ts:1038`
explicitly documents the pattern ("If not provided, the tool will not be
executed automatically"). v2's T5 AC 1 names this requirement directly so
the impl agent doesn't add an unnecessary execute function.

### 3. Drain rewrite is a REPLACEMENT, not additive (applied to v2)

v1's T5 Step 9 was ambiguous about whether text deltas would still be
joined post-T5. The probe confirmed `tool-input-available` carries both
`toolName` and the assembled `input` (typed `unknown`), so finalize
extraction is a clean self-contained operation. v2's T5 AC 7 makes this
explicit: REPLACE text-joining with finalize-input extraction. If the
model goes off-script and emits both text and `finalize`, `finalize.answer`
wins; text deltas are ignored. Behavior is intentional — the contract is
"finalize is the canonical answer source".

### 4. System prompt "at most 8 tool calls" stale after T5 (applied to v2)

v1's T3 hardcoded "at most 8 tool calls" in the prompt. v1's T5 raised
the actual step budget to 10 but didn't update the prompt's hardcoded
number — the prompt would have said 8 while the runtime permitted 10,
and `hasToolCall('finalize')` would have been the real primary stop. v2's
T5 Step 7 drops the "at most 8" wording entirely and replaces it with a
`finalize`-driven directive, since `hasToolCall` makes hard step counts
irrelevant to the user. T5 Step 8 also removes the corresponding test
assertion.

### 5. T5 streaming UX regression — user picked progressive streaming via `tool-input-delta` (applied to v2)

The biggest find. After T5, the model emits ONLY tool calls (grep_doc +
finalize). No free-form text in the stream. The user-visible answer
arrives as the `input` argument of `finalize` — fully assembled only when
`tool-input-available` fires at the end of the turn. With 1-3 grep
round-trips in between, that's potentially 10+ seconds of silence in the
UI before the answer pops up.

v1 acknowledged this risk in T5's "Risks" subsection but punted on the
fix ("verify the chat UI" / "file follow-up if larger work needed").

The user explicitly chose **progressive streaming** as the resolution:
the chat UI subscribes to `tool-input-delta` chunks for the `finalize`
call and renders the `answer` field token-by-token. v2 expands T5's
scope to include the apps/web work (new Steps 12-13). Implementation
notes:

- `tool-input-delta` chunks lack `toolName` — must track `toolCallId`
  from the preceding `tool-input-start`.
- The deltas are raw JSON characters of the assembling args. Two ways
  to render: (a) display raw JSON live + swap to clean text on
  completion, or (b) write a streaming JSON parser to extract `answer`'s
  value progressively. v2 leaves the choice to the impl agent (the
  cleaner approach depends on how `@ai-sdk/svelte`'s Chat component
  exposes raw chunks).
- v2 includes an explicit escape hatch: if apps/web rework gets out of
  hand, revert Step 12 and file a follow-up bd. The structural agent fix
  (Steps 1-11) is independently shippable.

## Items not raised

- **`tool()` field names** — v1 already used `description` + `inputSchema`,
  which match `@ai-sdk/provider-utils@4.0.27`'s actual signature. No
  change needed.
- **`hasToolCall` exists and is exported from `'ai'` root** — confirmed.
  v1 already wrote the correct import.
- **`stopWhen` accepts an array** — confirmed in `dist/index.d.ts`. v1's
  T5 `[stepCountIs(10), hasToolCall('finalize')]` shape works as written.
- **κ tolerance inconsistency** — T1 says "within ±0.05", T5 says "≥ 0.60".
  These are intentionally different bars: T1 expects a no-op for κ
  (temperature shouldn't shift the judge's grading much), while T5
  fundamentally changes what `output` contains (now `finalize.answer`
  instead of free-form text), so a re-baseline is expected. Left as-is
  in v2; documented in T5 AC 12.

## Unresolved questions

- **Will `@ai-sdk/svelte`'s Chat component expose raw stream chunks?**
  T5 Step 12 says "if not directly accessible, drop down to manual
  fetch + parseJsonEventStream". This is a real architectural fork the
  impl agent will face — no way to resolve without trying it.
- **Will the model actually call `finalize` reliably?** The prompt
  directive plus tool description should be strong enough, but Sonnet
  occasionally ignores instructions. T5 Step 17 has a follow-up-bd
  escape hatch for "agent occasionally skips finalize call".
- **What κ does the new judge-input shape produce?** Calibration
  re-run after T5 is the only way to know. AC 12 caps the regression at
  `< 0.60` — below that, the spec says escalate.
