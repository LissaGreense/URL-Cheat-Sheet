# Team: frontend-impl-team

**Owned paths:** `apps/web/**`, `packages/qa/src/page-objects/**` (when added)
**Skills:** `svelte-frontend`, `superpowers:test-driven-development`, `superpowers:testing`

## Handoff in

Claims `bd` issues with `team:frontend-impl-team` in status `ready`.

## Handoff out

- Working code, tests passing locally (`bun --filter @url-cheat-sheet/web test`).
- Commits follow the conventional-commit style from `superpowers:committing`.
- Transitions issue to `in_review`, leaves it for orchestrator to run gates.

## Escalation rules

- New cross-package surface needed → ask `schemas-team` to add a schema first; do not invent inline types.
- Streaming changes that touch `packages/agent/**` → escalate to orchestrator; the agent team owns that path.
