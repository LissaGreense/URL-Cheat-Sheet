---
description: Orchestrator entrypoint. Picks the top-priority ready bd issue, creates a worktree, and spawns the team named in the issue's `team:` label.
---

1. Invoke the `using-this-repo` skill (always first).
2. Read `bv --robot-priority` and pick the top recommendation. Confirm the issue
   has a `team:` label (the signal that `task-enrichment` ran on it); skip any
   `proposed` items — they aren't claimable yet.
3. Extract the `team:<name>` label.
4. Create a worktree: `git worktree add ../wt-<id> -b feat/<id>-<slug> main`.
5. Spawn the named team using `superpowers:subagent-driven-development`, passing
   the issue ID and worktree path. **Include the team's "Must-read constraints"
   section** (from `.claude/teams/<name>.md`) verbatim in the dispatch prompt so
   the subagent doesn't have to re-discover Zod 4 idioms, the SSRF footgun,
   `chatRequestSchema`-stays-`z.object`, and other CLAUDE.md-derived
   constraints. Skip this for teams without a Must-read section
   (gate/review/qa/evals teams don't author code).
6. After the team reports success, run gates declared on the issue (`gate:review`, `gate:qa`, `gate:evals`).
7. On all gates green, transition the issue to `closed`, merge the branch, remove the worktree.
8. Report the final status to the user.

If any step fails twice, stop and ask the user.
