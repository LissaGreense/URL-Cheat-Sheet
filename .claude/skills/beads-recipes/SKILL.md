---
name: beads-recipes
description: Use when you need to query, create, or transition beads (`bd`) issues, or when you need a parallel-track plan via `bv`. Provides the canonical commands so they don't drift across the repo.
---

# Beads recipes

Always invoke `bd` with `--no-daemon` — this repo runs across worktrees.

## Queries

| Intent | Command |
|---|---|
| What's claimable now | `bd --no-daemon ready` |
| Parallel-track plan (JSON) | `bv --robot-plan` |
| Priority recommendations (JSON) | `bv --robot-priority` |
| Graph metrics (JSON) | `bv --robot-insights` |
| Diff since a commit/date | `bv --robot-diff --diff-since <ref>` |
| Single issue detail | `bd --no-daemon show <id>` |

## Creation

```bash
bd --no-daemon create \
  --title "<imperative title>" \
  --kind {feature,bug,chore,qa-defect,review-action} \
  --label "team:<team-name>" \
  --label "gate:<qa|evals|review>" \
  --status proposed
```

## Transitions

| From → To | When |
|---|---|
| `proposed` → `enriched` | After `task-enrichment` adds acceptance criteria + team label |
| `enriched` → `ready` | After orchestrator confirms dependencies wired |
| `ready` → `in_progress` | Team claims, sets `owner` |
| `in_progress` → `in_review` | Implementation complete, awaiting review/QA/evals |
| `in_review` → `closed` | All declared gates passed |

Use: `bd --no-daemon update <id> --status <new-status>`

## Dependencies

```bash
# A blocks B (B can't start until A closes)
bd --no-daemon dep add --blocker <A> --blocked <B>
```

## Worktrees

Every implementation issue gets its own worktree. The orchestrator creates it,
spawns the team, merges on close. Pattern:

```bash
git worktree add ../wt-<issue-id> -b feat/<issue-id>-<slug> main
# ... team works ...
git worktree remove ../wt-<issue-id>
```
