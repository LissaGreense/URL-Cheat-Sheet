# v1 Plan Review Report — grounding-judge-redesign

**Reviewed:** `docs/plans/2026-05-20-grounding-judge-redesign.md` (v1, committed 2026-05-20 on `feat/grounding-judge-redesign`)
**Reviewer:** improving-plans skill, single pass
**Output:** `docs/plans/2026-05-20-grounding-judge-redesign.v2.md`

## Method

Probed `node_modules` to verify two API surfaces the plan touches:

- `ai@6.0.184` `generateText` — signature, prompt vs. messages discriminator, where `.text` lives on the result, whether `temperature: 0` is accepted.
- `promptfoo@0.121.11` `type: javascript` assertion file-loader — confirmed it strips `file://` (two slashes) and resolves via `path.resolve(state.basePath, ...)` against the YAML config directory. Same footgun as the provider's `file:` path.

Both surfaces matched what the v1 plan assumed; the verified-name notes were folded into v2's "Library reference" section so the impl agent doesn't have to re-verify.

## Findings

### 1. JSON parsing strictness (applied to v2)

v1's Task 2 called `JSON.parse` directly on the judge's response text. Sonnet sometimes wraps JSON in markdown fences or prefixes prose, even with `temperature: 0`. v1's behavior on this: malformed → fail verdict. That's defensible but produces fail-verdicts that aren't actually substantive grounding failures.

v2 adds a lightweight extraction step before `JSON.parse`: `text.match(/\{[\s\S]*\}/)?.[0] ?? text`. Grabs the first balanced-looking `{...}` substring, falls back to the full text if no braces found, then strict-parses. Catches the common "Here is the verdict:\n```json\n{...}\n```" case without sacrificing strictness.

v2 also adds a new test case (Task 2 case F — prose-prefixed JSON) that pins the extraction layer's behavior.

### 2. Cohen's κ degenerate-case guard (applied to v2)

v1's Task 5 specified the standard Cohen's κ formula:
- `pe = ((TP+FN)*(TP+FP) + (TN+FP)*(TN+FN)) / N²`
- `κ = (po - pe) / (1 - pe)`

But didn't handle `pe ≈ 1`. If all 10 gold rows have the same `humanVerdict` and the judge agrees on all of them, chance agreement is 100% and the denominator becomes 0 → NaN. The actual gold set is 5+5 by design so this won't happen in normal operation, but the script needs to not crash on edge cases (someone might experiment with a smaller gold set during calibration tuning).

v2 adds an explicit guard: if `pe >= 1 - 1e-9`, treat κ as `1.0` when `po == 1` else `0.0`, and log the degenerate case in the snapshot.

### 3. Capture script placement (applied to v2)

v1's Task 4 Step 1 suggested writing the doc-capture script to `/tmp/capture.ts`. That fails: `bun /tmp/capture.ts` can't resolve workspace imports (`@url-cheat-sheet/agent`) because the script isn't inside a workspace package, so Bun's resolver doesn't find the symlink chain.

v2 relocates it to `packages/evals/scripts/capture-doc.ts` — within the package, workspace imports resolve. The script is throwaway and explicitly deleted before the gold-set commit (Task 4 Step 4); not gitignored, just not committed.

### 4. Calibration uses embedded text, not live fetches (applied to v2)

v1 implied this but didn't say it. v2 makes it explicit in both Task 4 Step 2 ("the calibration script uses the EMBEDDED `document.text` from the gold set, NEVER re-fetches the URL") and Task 5's contract description.

Why this matters: if calibration re-fetched live URLs, URL drift (Wikipedia edits, RFC site moves) would silently change the test inputs over time. The gold set is a fixed-input judge test; the embedded text is the fixed input.

### 5. Cost estimate + spend guardrail (applied to v2)

v1 had no cost note. v2 adds a ~$1/Task 7 run estimate (10 sonnet judge calls @ $0.04 + 5 agent calls + 5 more judge calls) and a guardrail: if the impl agent burns >5 retries, stop and escalate rather than churning spend.

Cheap insurance against an impl agent looping on a tuning problem without realising the costs.

## Items not raised

- **`generateText` call shape.** Verified to match v1's assumption — `prompt: string` shorthand works, `.text` is direct, `temperature: 0` accepted. v2's Library reference makes this verified rather than "verify before pasting".
- **`type: javascript` file:// loader.** Verified to match the provider loader (`file://` two slashes, `path.resolve(basePath, ...)` against YAML config dir). v2 notes this in the Library reference. v1's path `file://../../src/asserts/grounding-judge.ts` is correct as-written.
- **`AssertionValueFunctionContext.vars[name]` types.** `vars: Record<string, VarValue>` where `VarValue` may not be `string`. v1 already defensively handles non-string `question` — kept as-is.
- **Test count narration cleanup.** v1's Task 3 Step 5 had an awkward "wait, that's 15; recount..." parenthetical. v2 cleans this to a single coherent sentence.
- **Test count change.** v1 said 5 tests in `grounding-judge-core.test.ts`; v2 adds a 6th (case F for the extraction layer). Total goes from 19 to **20 assertions across 3 files**.

## Unresolved questions

- **Does Sonnet 4.6 actually emit markdown fences with `temperature: 0` and an explicit system prompt forbidding them?** v2 adds the extraction layer + a test pinning the behavior — but the empirical answer comes from Task 7's live calibration. If the extraction never fires in practice (Sonnet behaves perfectly), the layer is harmless overhead. If it fires often, it was load-bearing.
- **What's the right gold-set size for a stable κ measurement?** v2 keeps v1's 10 rows. Cohen's κ on n=10 is noisy; 20-30 would be more stable but more authoring work. The spec already carves this as a followup ("Expand gold set to 20-30 examples once we've stress-tested the v1 set"). v1 set is the minimum viable measurement.
- **Will κ ≥ 0.6 actually pass on the first try?** No way to know without running it. If it fails, the escalation paths are documented (refine gold set OR escalate judge model). The spec's design is robust to either outcome.
