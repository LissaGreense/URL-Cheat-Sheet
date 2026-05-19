---
name: beads-recipes
description: Use when you need to query, create, or transition beads (`bd`) issues, or when you need a parallel-track plan via `bv`. Provides the canonical commands so they don't drift across the repo.
---

# Beads recipes

`bd` v1.x (>= 1.0.2) is worktree-safe by default — worktrees share the same
database via git common-directory discovery. No flags needed. The legacy
`--no-daemon` flag was removed upstream in v0.51.0 (Feb 2026) and now errors.

Project issue prefix: `ucs` (set in `.beads/config.yaml`).

## Queries

| Intent | Command |
|---|---|
| What's claimable now | `bd ready` |
| Parallel-track plan (JSON) | `bv --robot-plan` |
| Priority recommendations (JSON) | `bv --robot-priority` |
| Graph metrics (JSON) | `bv --robot-insights` |
| Diff since a commit/date | `bv --robot-diff --diff-since <ref>` |
| Single issue detail | `bd show <id>` |

## Creation

```bash
bd create \
  --title "<imperative title>" \
  --kind {feature,bug,chore,qa-defect,review-action} \
  --label "team:<team-name>" \
  --label "gate:<qa|evals|review>" \
  --status proposed
```

## Transitions

| From → To | When |
|---|---|
| `proposed` → `open` | After `task-enrichment` adds acceptance criteria + `team:` label |
| `open` → `in_progress` | `opening-pr-orchestrator` `pr-open` action (worktree + draft PR created) |
| `in_progress` → `in_review` | Implementation complete, `pr-ready` action flips PR to ready |
| `in_review` → `closed` | All declared gates passed, `pr-merge` action lands the squash-merge |

Use: `bd update <id> --status <new-status>`

The only custom statuses in this project are `proposed` (un-enriched holding pen)
and `in_review` (PR open, gates clearing). Built-in `open` is the canonical
claimable state — both `bd ready` and `bv --robot-priority` filter to active
built-in statuses, so enriched issues must live there to be picked up. See ADR 0006.

## Dependencies

```bash
# A blocks B (B can't start until A closes)
bd dep add --blocker <A> --blocked <B>
```

## Worktrees

Every implementation issue gets its own worktree. The orchestrator creates it,
spawns the team, merges on close. Pattern:

```bash
git worktree add ../wt-<issue-id> -b feat/<issue-id>-<slug> main
# ... team works ...
git worktree remove ../wt-<issue-id>
```
