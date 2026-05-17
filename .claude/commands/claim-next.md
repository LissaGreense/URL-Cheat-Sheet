---
description: Orchestrator entrypoint. Picks the top-priority ready bd issue, creates a worktree, and spawns the team named in the issue's `team:` label.
---

1. Invoke the `using-this-repo` skill (always first).
2. Read `bv --robot-priority` and pick the top issue with status `ready`.
3. Extract the `team:<name>` label.
4. Create a worktree: `git worktree add ../wt-<id> -b feat/<id>-<slug> main`.
5. Spawn the named team using `superpowers:subagent-driven-development`, passing the issue ID and worktree path.
6. After the team reports success, run gates declared on the issue (`gate:review`, `gate:qa`, `gate:evals`).
7. On all gates green, transition the issue to `closed`, merge the branch, remove the worktree.
8. Report the final status to the user.

If any step fails twice, stop and ask the user.
