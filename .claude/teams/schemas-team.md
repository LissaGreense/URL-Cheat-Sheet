# Team: schemas-team

**Owned paths:** `packages/schemas/**`
**Skills:** `superpowers:test-driven-development`, `superpowers:testing`

## Handoff in

Claims `bd` issues with `team:schemas-team`.

## Handoff out

- New/changed Zod schemas with unit tests.
- Downstream consumers updated in the same commit set when breaking.
- Transitions issue to `in_review`.

## Escalation rules

- Breaking schema change with > 2 downstream consumers → escalate to orchestrator for a coordinated rollout.
