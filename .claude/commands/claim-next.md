---
description: Orchestrator entrypoint. Picks the top-priority ready bd issue, creates a worktree, and spawns the team named in the issue's `team:` label.
---

1. Invoke the `using-this-repo` skill (always first).
2. Read `bv --robot-priority` and pick the top recommendation. Confirm the issue
   has a `team:` label (the signal that `task-enrichment` ran on it); skip any
   `proposed` items — they aren't claimable yet.
3. **Atomically claim the issue**: `bd update <id> --claim`. On exit=0, proceed.
   On exit=1 the issue is already claimed by another orchestrator — log the
   loser, re-read `bv --robot-priority`, and pick the next recommendation.
   Cap retries at 3; if you lose three races in a row, stop and ask the user
   (that's a sign of something other than a race). The flag is verified atomic
   in embedded bd (`bd merge-slot` test dir, 10/10 races: one winner per race).
4. Extract the `team:<name>` label.
5. Create a worktree: `git worktree add ../wt-<id> -b feat/<id>-<slug> main`.
6. Spawn the named team using `superpowers:subagent-driven-development`, passing
   the issue ID and worktree path. **Include the team's "Must-read constraints"
   section** (from `.claude/teams/<name>.md`) verbatim in the dispatch prompt so
   the subagent doesn't have to re-discover Zod 4 idioms, the SSRF footgun,
   `chatRequestSchema`-stays-`z.object`, and other CLAUDE.md-derived
   constraints. Gate-style teams (review/qa/evals) have no constraints
   section — skip the inline.
7. After the team reports success, run gates declared on the issue (`gate:review`, `gate:qa`, `gate:evals`).
8. On all gates green, transition the issue to `closed`, merge the branch, remove the worktree.
9. Report the final status to the user.

If any step fails twice, stop and ask the user.
