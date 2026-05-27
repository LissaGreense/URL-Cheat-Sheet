# Review: ucs-g9m — dedupe motion curve literals via `_curves` module

- **PR:** https://github.com/LissaGreense/URL-Cheat-Sheet/pull/135
- **Branch:** `feat/ucs-g9m-curve-tokens-dedupe`
- **Commit reviewed:** `d427d36`
- **Reviewer:** review-team
- **Date:** 2026-05-27
- **Verdict:** APPROVED

## Scope

Small debt cleanup. The `'cubic-bezier(0.16, 1, 0.3, 1)'` literal was
previously inlined as a module-local `EASE_OUT_EXPO` constant in three
motion actions (`splitLineReveal.ts`, `scanSweep.ts`,
`assembleCascade.ts`). Now it lives once in
`apps/web/src/lib/motion/_curves.ts` and is imported by all three.

A new drift-guard test (`_curves.test.ts`) parses
`apps/web/src/lib/styles/tokens.css` and asserts the exported constant
matches the `--ease-out-expo` declaration verbatim.

## Acceptance criteria — met

> No `'cubic-bezier(0.16, 1, 0.3, 1)'` literal duplicated across
> `apps/web/src/lib/motion/*.ts`. Pick one: (a) shared curves module
> imported by all motion actions, or (b) deterministic test asserting
> JS-side curve constants match `tokens.css` values. Drift cannot land
> silently.

The PR satisfies **both** (a) and (b):

- **(a)** Single `EASE_OUT_EXPO` constant in `_curves.ts` consumed by
  all three motion actions (verified via diff and grep).
- **(b)** `_curves.test.ts` reads `tokens.css` at test time and
  asserts equality. Drift in either direction (CSS edited, JS edited)
  fails the test.

## What I checked

### 1. Grep for remaining duplicates in `*.ts` (non-test)

```
$ grep -rE "cubic-bezier\(0\.16" apps/web/src/lib/motion/
apps/web/src/lib/motion/scanSweep.ts: * The descent tween uses `--ease-out-expo` (cubic-bezier(0.16, 1, 0.3, 1))
apps/web/src/lib/motion/scanSweep.test.ts:    // Spec §3.1 — cubic-bezier(0.16, 1, 0.3, 1).
apps/web/src/lib/motion/scanSweep.test.ts:    expect((vars as { ease: string }).ease).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
apps/web/src/lib/motion/splitLineReveal.test.ts:    expect(vars.ease).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
apps/web/src/lib/motion/_curves.ts:export const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)' as const;
```

Remaining occurrences are all acceptable:

- `_curves.ts` — the canonical source (the whole point).
- `scanSweep.ts` — a `cubic-bezier(...)` reference in a **comment**,
  documenting the value of `--ease-out-expo` for readers. Not a
  runtime-coupled duplicate.
- `scanSweep.test.ts` / `splitLineReveal.test.ts` — assertions that
  the action emits the spec'd ease. Importing `EASE_OUT_EXPO` here
  would weaken the test (tautology: test imports the same constant
  it's asserting against, fails to catch a refactor that swapped the
  ease). Keeping the literal in tests gives an independent
  cross-check: action output ↔ literal ↔ (via `_curves.test.ts`)
  tokens.css. That triangle is exactly what makes silent drift
  detectable.

The acceptance criterion is about **`*.ts` source** duplicates being
removed; test files asserting expected output values are a different
animal. No source-side duplication remains.

### 2. Drift guard — does it actually catch drift?

Read `_curves.test.ts`:

- Resolves `tokensPath` via `fileURLToPath(import.meta.url)` + `..`,
  so the lookup is **relative to the test file**, not CWD. Robust to
  where vitest is launched from. Not flaky.
- Regex `--ease-out-expo\s*:\s*([^;]+);` captures everything between
  `:` and `;`, trims whitespace. `tokens.css` line 47 reads
  `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);` — extraction
  produces `cubic-bezier(0.16, 1, 0.3, 1)`, which matches
  `EASE_OUT_EXPO` verbatim.
- Mental drift scenarios:
  - If someone edits `tokens.css` to `cubic-bezier(0.2, 1, 0.3, 1)`:
    extracted value differs from `EASE_OUT_EXPO` → assertion fails.
  - If someone edits `_curves.ts` literal: same assertion fails from
    the other direction.
  - If the `--ease-out-expo` declaration is deleted from
    `tokens.css`: `cssValue` is `null`, the first
    `expect(...).not.toBeNull()` fails with a clear signal.

Drift guard is sound.

### 3. Collateral changes

Diff is exactly the 5 files described in the task brief
(`git diff main..HEAD --stat`):

```
 apps/web/src/lib/motion/_curves.test.ts    | 43 ++++++++++++++++++++++++++++++
 apps/web/src/lib/motion/_curves.ts         | 18 +++++++++++++
 apps/web/src/lib/motion/assembleCascade.ts |  3 +--
 apps/web/src/lib/motion/scanSweep.ts       |  6 +----
 apps/web/src/lib/motion/splitLineReveal.ts |  6 +----
 5 files changed, 64 insertions(+), 12 deletions(-)
```

No unrelated edits. The three call-site changes are mechanical:
delete the local `const EASE_OUT_EXPO = ...`, add the named import.

### 4. Other curves — is dedupe complete?

```
$ grep -rE "ease-out-soft|ease-linear" apps/web/src/lib/motion/
(no matches)
```

`--ease-out-soft` and `--ease-linear` exist in `tokens.css` but are
not referenced by any motion action JS. Dedupe is complete for the
set of curves actually used in JS land. No incomplete coverage.

### 5. Conventions

- **Underscore prefix convention.** `_curves.ts` joins
  `_reducedMotion.ts` — consistent with the existing pattern for
  module-internal helpers.
- **TS strict / `as const`.** `EASE_OUT_EXPO` is typed
  `'cubic-bezier(0.16, 1, 0.3, 1)'` (string literal type) via `as
  const`. Narrowest sound type for the value. Good.
- **No `eslint-disable` / `@ts-ignore`.** None added.
- **JSDoc on exports.** Both the `@fileoverview` and the constant
  itself are documented. The comments explain **why** (GSAP can't
  parse `var(--ease-out-expo)`, drift-guard exists) rather than
  **what** the value is. On-spec for the project's documentation
  conventions.
- **No barrel files.** None added; imports go to `./_curves` directly.

### 6. Test determinism

- Filesystem read happens at `describe` body time (once), then a
  single `it` consumes the cached `css` string. No timing dependency,
  no network, no clock. Deterministic.
- Path resolution is robust to CWD (see point 2). No flakiness risk
  from worktrees / monorepo paths.

### 7. Test suite — no regressions

```
$ bun run test -- --run src/lib/motion/
 Test Files  8 passed (8)
      Tests  82 passed (82)
```

All motion tests pass, including `_curves.test.ts` (the new file),
`scanSweep.test.ts`, `splitLineReveal.test.ts`. The existing
literal-assertion tests in scanSweep/splitLineReveal continue to
pass, confirming the call-sites still emit the correct ease after
the import refactor.

## Minor observations (no changes required)

- `_curves.ts` is currently single-export. The file's docstring
  already anticipates future curves being added under the same
  drift-guard pattern. Fine — extension is trivial when a second JS
  curve becomes necessary.
- `readCssVar`'s regex captures the **first** declaration of a name.
  `tokens.css` only declares each curve once today, and the helper's
  docstring calls that out. If a curve ever gets a media-query
  override in `tokens.css`, the helper would need to be updated to
  match the appropriate context — but that's a hypothetical future
  problem.

## Decision

APPROVED. The PR meets the bd acceptance criteria on both bullets,
the drift guard is sound and deterministic, conventions are honored,
and there's zero collateral surface. Ship it.
