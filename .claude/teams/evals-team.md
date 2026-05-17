# Team: evals-team

**Owned paths:** `packages/evals/**`, `docs/evals/**`
**Skills:** `evals-promptfoo`, `superpowers:test-driven-development`

## Handoff in

Triggered when an issue moves to `in_review` with `gate:evals`, or via direct
request to author a new suite.

## Handoff out

- New/updated suite under `packages/evals/suites/`.
- Snapshot at `docs/evals/<suite>-YYYY-MM-DD.md`.
- For regressions, a `bd` issue with `kind:bug`, `gate:evals`, blocking the parent.

## Escalation rules

- Regression unclear (judge prompt may be wrong) → escalate to the issue owner.
