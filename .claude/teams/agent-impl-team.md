# Team: agent-impl-team

**Owned paths:** `packages/agent/**`
**Skills:** `superpowers:test-driven-development`, `superpowers:testing`, `claude-api` (if available), `evals-promptfoo`

## Handoff in

Claims `bd` issues with `team:agent-impl-team` in status `ready`.

## Handoff out

- Tests passing (`bun --filter @url-cheat-sheet/agent test`).
- If the change is non-trivial, an eval suite update under `packages/evals/suites/`.
- Transitions issue to `in_review`.

## Escalation rules

- Schema changes → coordinate with `schemas-team` first.
- Frontend integration changes → escalate to orchestrator.
