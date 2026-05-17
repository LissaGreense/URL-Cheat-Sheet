# Team: orchestrator

**Owned paths:** none (cross-cutting)
**Skills:** `superpowers:subagent-driven-development`, `beads-recipes`, `using-this-repo`

## Handoff in

Triggered manually by the user or by a slash command (`/claim-next`). Reads
`bd --no-daemon ready` and picks the highest-priority issue (`bv --robot-priority`).

## Handoff out

- Per issue: create a worktree (`git worktree add ../wt-<id> -b feat/<id>-<slug> main`).
- Spawn the team named in the issue's `team:` label.
- After the team reports success, run any required gates (review, qa, evals).
- Transition the issue: `ready` → `in_progress` → `in_review` → `closed`.
- Merge the worktree branch into main and remove the worktree.

## Escalation rules

- Ambiguous team routing → ask the user.
- Failing gate after 2 fix loops → ask the user.
- Conflicting bd dependencies → ask the user.

## Hard rule

**Only the orchestrator spawns teams.** No team spawns another team.
