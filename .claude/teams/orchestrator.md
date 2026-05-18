# Team: orchestrator

**Owned paths:** none (cross-cutting)
**Skills:** `superpowers:subagent-driven-development`, `beads-recipes`, `using-this-repo`

## Handoff in

Triggered manually by the user or by a slash command (`/claim-next`). Reads
`bd ready` and picks the highest-priority issue (`bv --robot-priority`).

## Handoff out

For each ready issue:

1. **Create worktree:** `git worktree add ../wt-<id> -b feat/<id>-<slug> main`
2. **`pr-open`:** invoke `opening-pr-orchestrator` skill, Action 1. Opens draft PR, records URL in bd notes, transitions bd → `in_progress`.
3. **Spawn team** named in the issue's `team:` label.
4. **`pr-ready`:** when team reports success, invoke skill Action 2. Marks PR ready, increments review-pass counter, transitions bd → `in_review`.
5. **Gate dispatch:** for each `gate:*` label, spawn the corresponding gate agent (review / qa / evals). Each clears its own label.
6. **`pr-merge`:** when all `gate:*` labels (except `gate:pr`) are cleared and CI is green, invoke skill Action 3. Squash-merges, closes bd, removes worktree.

## Recovery & escalation (canonical table)

| Failure | Detection | Recovery | Escalation |
|---|---|---|---|
| CI fails on PR | `gh pr checks` returns non-pass after impl reports done | bd `in_review` → `in_progress`; PR stays draft; note `ci-fail: <check> @ <ts>` | After **2** consecutive CI fails on the same PR: `bd human <id>` |
| Review-pass cap | counter ≥ **3** without approval | Loop stops; PR remains open with `gate:review` set | `bd human <id>` immediately |
| Gate stalls | `gate:*` unchanged > **2h** with bd in `in_review` | Re-spawn the responsible agent once (safe to retry) | If still stalled: `bd human <id>` |
| Merge conflict | `gh pr merge` returns conflict | `git rebase main` on worktree; force-push to `feat/*` (only sanctioned force-push) | If rebase has conflicts: `bd human <id>`; preserve worktree |
| bd ↔ PR divergence | Nightly `scripts/bd-pr-audit.sh` | Audit files GitHub issues labelled `incident`, dedup-keyed by bd id | Always escalates |
| Worktree orphaned | `git worktree list` vs bd-`closed` for > 24h | `git worktree remove ../wt-<id>` automatically | None — pure cleanup, logged |
| Aborted PR | bd → `blocked`/`proposed` while PR open | `gh pr close` with abort comment; remove worktree | Logged; re-attempt requires fresh issue |
| Force-push to `main` succeeds | Branch-protection bypass | `bd create --type=bug --label=incident --priority=0`; no auto-revert | `bd human <id>` immediately |

## Hard rules

1. **Only the orchestrator spawns teams.** No team spawns another team.
2. **Orchestrator never writes to `main` directly.** All writes to `main` happen via `gh pr merge`, never `git push main`.
3. **Re-runnable from a clean state.** Actions are safe to retry after
   a prior step failed BEFORE completing. Once an action has succeeded
   end-to-end, subsequent runs will error rather than corrupt state.
   bd is the authority for what's "done."
