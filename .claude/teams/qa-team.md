# Team: qa-team

**Owned paths:** `docs/qa/cases/**`, `docs/qa/reports/**`, `packages/qa/src/case-loader.ts`
**Skills:** `qa-standard`, `agent-browser` (if available)

## Handoff in

Triggered when an issue moves to `in_review` with `gate:qa`. Also handles
direct `gate:qa` runs against deployed previews.

## Handoff out

- `docs/qa/reports/YYYY-MM-DD-<feature>.md`.
- Defect `bd` issues for each failure, blocking the parent feature.
- Transitions parent only if all defects close.

## Escalation rules

- Chrome MCP fails 2-3 times → stop, ask the user.
- Case file ambiguous → ask the feature owner.

## Guardrail

This team **does not fix defects.** Implementation teams do.
