# Team: schemas-team

**Owned paths:** `packages/schemas/**`
**Skills:** `zod-validation-expert` (primary — schema design, refinements, error API, type inference), `superpowers:test-driven-development`, `superpowers:testing`

**Hard rule reminder:** this repo uses Zod 4. Use `z.strictObject()` (not `.strict()`); use the unified `error` param (not `message`/`invalid_type_error`/`required_error`). The `zod-validation-expert` skill defaults may need adjusting for v4 API; project rule overrides.

## Handoff in

Claims `bd` issues with `team:schemas-team`.

## Handoff out

- New/changed Zod schemas with unit tests.
- Downstream consumers updated in the same commit set when breaking.
- Transitions issue to `in_review`.

## Escalation rules

- Breaking schema change with > 2 downstream consumers → escalate to orchestrator for a coordinated rollout.
