## Review: feat/ucs-cv7-evals-env-loading

**Date:** 2026-05-27
**Branch:** feat/ucs-cv7-evals-env-loading
**PR:** #130
**Verdict:** APPROVED

## Summary

Fixes the eval harness bug where `bunx promptfoo` in `run.ts` couldn't see
`ANTHROPIC_API_KEY` from the user-managed repo-root `.env` because Bun only
auto-loads `.env` from the subprocess `cwd` (pinned to `packages/evals/` so
workspace symlinks resolve). The fix adds a tiny in-tree dotenv parser
(`load-env.ts`, 71 LOC), merges it under `process.env` so shell exports
win, and threads the result into `spawnSync`'s `env`. The change is
surgical, no new runtime deps, acceptance criteria met, 9/9 CI green.

## Critical

None.

## Important

None.

## Findings — by category

### Correctness (positives)

- **`spawnSync` env semantics are correct.** Passing `env: childEnv`
  replaces (does not extend) the child's environment. Both halves of the
  merge are explicit — `dotenvFromRepoRoot` first, `process.env` second
  — so the child gets exactly the union with the documented precedence.
  No "but did `PATH` survive?" footgun because Node propagates `PATH`
  through `process.env` already.
- **`isFileNotFound` only swallows `ENOENT`.** `EACCES`, `EISDIR`, and
  other I/O errors bubble up — which is the right call. Missing `.env`
  is the canonical CI / exported-shell case; an unreadable `.env` is a
  real problem the user should hear about loudly.
- **Merge precedence matches the README claim and the `dotenv`
  convention.** Spread order `{ ...dotenvFromRepoRoot, ...process.env }`
  makes shell exports override `.env` values. The README documents this
  unambiguously ("anything already exported in the parent shell
  overrides values from `.env`"). Code and docs agree.
- **Repo-root resolution is robust.** `resolve(packageRoot, '..', '..')`
  off `import.meta.url` — works under worktrees, monorepo moves, and
  symlinked `packages/`. No reliance on `process.cwd()`.

### Tests (positives)

- **Deterministic, tmpdir-isolated, no real `.env` touched.** Per the
  repo's "deterministic over evals" guideline, this is exactly right
  — env parsing is deterministic so it's tested with `expect().toEqual`,
  not promptfoo. `mkdtempSync(... 'ucs-evals-load-env-')` per test +
  `rmSync` in `afterEach` keeps parallel runs safe.
- **Coverage matches the parser's documented surface.** All 8 cases
  cover the listed edge cases (KV pairs, comments, whitespace, quotes,
  `export` prefix, missing file, lines without `=`, duplicate keys
  last-write-wins). No gaps in the supported subset.
- **Tests verified locally** (`bun test packages/evals/tests/load-env.test.ts`)
  → 8 pass, 0 fail, 101ms.

### Docs (positives)

- **README is concise and accurate.** Documents the precedence, names
  the symptom (0-token empty output), explains *why* the merge is
  needed (Bun + `cwd: packageRoot` + workspace symlinks), and links the
  bd id. Closes the explanation loop for the next person who hits this.
- **Author-friendly framing.** "Exporting in the parent shell still
  works — and wins over a value in `.env`, by design" is exactly the
  right tone for a self-documenting precedence rule.

### Conventions (positives)

- **TS strict + `verbatimModuleSyntax` honored.** No `eslint-disable`,
  no `@ts-ignore`, no `@ts-expect-error`. `unknown`-narrowing in
  `isFileNotFound` is the canonical pattern.
- **No new runtime dep.** The JSDoc on `loadDotenv` calls this out
  explicitly: parser surface is small, `.env` is user-controlled. Right
  call — `dotenv` would be 7kb of code for the same ~15 lines.
- **Import-extension convention matches the rest of the package.**
  `src/run.ts` imports `./load-env` (no extension, consistent with
  `src/asserts/grounding-judge.ts` importing `../judges/...`). Tests
  use `.ts` extensions (consistent with the three existing
  `packages/evals/tests/*.test.ts` files).
- **JSDoc on the exported function.** Includes scope statement ("the
  subset we need") and the deliberate "no dotenv dep" rationale.

## Needs Decision

- **Mismatched-quote edge case.** `stripQuotes` checks
  `first === '"' && last === '"'` (or single-quote pair), so a
  pathological value like `"foo"bar"` would strip both edge quotes and
  yield `foo"bar`. Not tested, not a blocker. Real `.env` files don't
  contain unbalanced quotes around API tokens. Same for inline `#`
  comments (`FOO=bar # note`) — not supported, matches the documented
  subset. Both behaviors are fine to leave; if a future suite needs
  shell-quoted values, file a follow-up.
- **`childEnv` type drift.** `process.env` is typed as
  `Record<string, string | undefined>`. After spread, `childEnv` can
  hold `undefined` values, which `spawnSync` will coerce to `'undefined'`
  string in extremely rare cases. Not a real-world risk for this
  harness — but worth knowing if a future commit starts inspecting
  `childEnv` values directly. Not a blocker.

## Relevant paths

- `packages/evals/src/load-env.ts` — new 71 LOC parser
- `packages/evals/src/run.ts` — lines 27–35 add the merge
- `packages/evals/tests/load-env.test.ts` — 8 deterministic cases
- `packages/evals/README.md` — new, env-loading section is the
  load-bearing part
