# ADR 0008: Evals run locally, not in CI

**Status:** accepted
**Date:** 2026-05-20

## Context

`ci.yml` previously included an `eval-gate` job that ran a canary eval
(`bun run eval canary`) on every PR that touched `packages/agent/**` or
`packages/evals/**`. It consumed `ANTHROPIC_API_KEY` from repo
secrets — the only workflow that did so.

With the repo flipped to public (see ADR 0005's addendum sequence),
the eval job has two new properties that change the cost/benefit:

1. **Anthropic API spend on every PR run** is now visible to every
   contributor and shows up on the repo owner's bill regardless of who
   submitted the PR.
2. **Fork PRs cannot access `ANTHROPIC_API_KEY`** — GitHub denies
   secrets to workflows triggered by fork PRs by design. So `eval-gate`
   on a fork PR fails with an empty key, which looks like a real
   failure to external contributors and creates friction.

Evals were already separately runnable locally by the `evals-team` /
`evals-promptfoo` skill flow, gated through the bd `gate:evals`
label. The CI job was a redundant pre-check, not the authoritative
gate.

## Decision

**Drop the `eval-gate` job from `ci.yml`.** Evals run locally only,
clearing via the bd `gate:evals` label as before.

Mechanical changes:

- Remove the `eval-gate` job (`ci.yml`).
- Remove the `dorny/paths-filter@v3` step and `agent-touched` output
  from the `install` job — `eval-gate` was the only consumer.
- Stop referencing `secrets.ANTHROPIC_API_KEY` in any workflow. The
  secret itself can be deleted from the repo's GitHub settings; this
  is the owner's call (low value either way once unused).

Branch protection's required checks (`typecheck`, `lint`, `test`,
`build`) are unchanged — `eval-gate` was never in that list, so
removing it does not affect mergeability.

## Consequences

- **Positive:** Zero Anthropic API spend on CI runs. Public-repo
  contributors don't see a confusing red `eval-gate` failure on
  their fork PRs. One fewer Actions job per PR (faster CI for
  agent-touched PRs).
- **Positive:** The `gate:evals` bd label remains the single source
  of truth for "evals cleared." No more two-place tracking.
- **Negative:** Regression detection on agent quality now requires
  a deliberate local run before merge. The orchestrator's
  `evals-team` already does this; humans opening chore PRs must
  remember if their changes could affect agent quality.
- **Trade-off:** External contributors cannot demonstrate eval
  cleanness in their PR. The maintainer runs it locally before
  clearing `gate:evals`. Acceptable for a single-maintainer
  project; revisit if contributor volume grows.

## Alternatives considered

- **Keep `eval-gate` but skip on fork PRs:** Possible with
  `if: github.event.pull_request.head.repo.full_name == github.repository`.
  Rejected because it still bills the maintainer for every internal
  PR run and adds workflow complexity for a check that's already
  gated locally.
- **Move evals to a manually-triggered workflow:**
  (`workflow_dispatch`). Tempting but adds a UI button the
  maintainer would rarely use vs just running locally. Rejected for
  YAGNI.
- **Keep eval-gate, switch to a cheaper model for canary:** Reduces
  but doesn't eliminate the fork-PR issue. Rejected.

## References

- ADR 0005 — branch-first + branch protection (the public-flip
  predecessor that surfaced the fork-PR friction).
- `.github/workflows/ci.yml` — the workflow this ADR modifies.
- `.claude/skills/evals-promptfoo/SKILL.md` — the local eval flow
  that remains authoritative.
