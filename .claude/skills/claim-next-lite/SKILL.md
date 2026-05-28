---
name: claim-next-lite
description: Lite-lane orchestrator for small issues — branch in-place, single commit, no separate worktree, no review-doc artifact, no merge slot. Use when the issue is single-team, has no gate:qa, and isn't tagged audit-trail or lane:heavy. For everything else use claim-next.
---

# Claim next (lite lane)

A simplified orchestrator path for issues that don't earn the heavy
pipeline's ceremony. Sits alongside [`claim-next`](../../commands/claim-next.md) —
the entry point that picks between lanes.

## When the lite lane fits

All of these:

- Issue has a single `team:` label.
- Issue does **not** have `gate:qa` (UI verification truly needs the
  heavy lane).
- Issue is **not** labeled `lane:heavy` or `audit-trail`.
- Priority is P2-P4 (P0/P1 always heavy by default — emergency fixes
  want the audit trail).
- The orchestrator is currently on a clean working tree (detached at
  `origin/main` or on `main`).

If any condition fails, fall through to [`claim-next`](../../commands/claim-next.md).

## What's stripped vs heavy

| Step                                | Heavy            | Lite                     |
| ----------------------------------- | ---------------- | ------------------------ |
| Separate worktree (`wt-<id>`)       | yes              | no, branch in-place      |
| `bun install`                       | full (fresh wt)  | fast re-link (existing)  |
| `.env` symlink                      | per-worktree     | inherit current          |
| Empty bootstrap commit              | yes              | no                       |
| Draft → ready PR transition         | yes              | open as ready directly   |
| `gate:pr` meta-label                | yes              | no                       |
| Review doc artifact (`.md`)         | committed        | PR comment only          |
| Merge slot acquire/release          | yes              | no (sequential lane)     |
| Sibling-worktree `git pull`         | yes              | no                       |

What stays the same:
- bd lifecycle (`claim` → `in_progress` → `in_review` → `closed`)
- Branch naming `feat/<id>-<slug>`
- CI green required
- `gate:review` honored if present (cleared via PR comment + label
  removal; no committed doc)
- `bd dolt push` after `bd close` (ADR 0010)

## Action 1: `lite-open` — branch + dispatch impl

```bash
ID="$1"   # bd issue id

# Pull latest bd state so any parallel claims/closures are visible.
bd dolt pull

# Atomic claim — exit=1 means another orchestrator beat us; bail.
bd update "$ID" --claim || { echo "abort: $ID claimed by someone else"; exit 1; }

# Derive slug + type for the branch name.
SLUG="$(bd show "$ID" --json | jq -r '.[0].title' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | tr -s '-' | sed 's/^-//;s/-$//')"
TYPE="$(bd show "$ID" --json | jq -r '.[0].issue_type' | sed 's/feature/feat/;s/bug/fix/;s/task/chore/')"

# Branch in-place. The current worktree must be clean and on
# main/detached-at-origin/main. The lite lane doesn't create a
# separate worktree.
git checkout -b "feat/$ID-$SLUG"

# Materialize deps. The lite lane reuses the current dir's node_modules,
# but the MAIN repo dir can go stale if recent work happened only in
# worktrees (each worktree runs its own install). A dep added in a
# worktree session won't be in the main dir's node_modules, so tests
# fail locally with "Failed to resolve import" even though CI (fresh
# install) is green. This is a fast re-link (~300ms warm), not a full
# install — cheap insurance. Discovered dogfooding ucs-vao: gsap was
# missing from the main dir, 17 test files failed to load until install.
bun install

# No bootstrap commit, no draft PR. The impl agent writes code, then
# we push + open PR as ready.
```

Then dispatch the impl team via `Agent` tool with:
- Worktree path = current repo root
- Branch = `feat/$ID-$SLUG`
- Instruction: write code, run typecheck/lint/test, commit with
  conventional message, push to the branch. **No `gh pr create` yet** —
  the orchestrator opens the PR after impl reports success.

After impl reports back with the commit SHA:

```bash
TITLE="$(bd show "$ID" --json | jq -r '.[0].title')"
# Render to a temp file — inline --body "$(...)" and process-substitution
# --body-file <(...) both intermittently fail in gh; a real file is reliable.
scripts/render-pr-body.sh "$ID" > "/tmp/pr-body-$ID.md"
gh pr create --base main --head "feat/$ID-$SLUG" \
  --title "$TYPE($ID): $TITLE" \
  --body-file "/tmp/pr-body-$ID.md"
PR_URL="$(gh pr view --json url -q .url)"
bd update "$ID" --notes "PR: $PR_URL"
bd update "$ID" --status in_review
```

## Action 2: `lite-review` — only if `gate:review` present

If `bd show "$ID"` does not have `gate:review` in labels, skip this
action entirely.

Dispatch the reviewer via `Agent`:
- Read the diff and the changed files.
- Verdict-only output: post a PR comment via `gh pr comment "$PR_URL"
  --body "**gate:review** — APPROVED. <one-liner>"` (or CHANGES
  REQUESTED with findings).
- **No committed review doc.** Audit trail lives in the PR comment
  and bd notes only.

On approval:
```bash
bd update "$ID" --remove-label "gate:review"
bd update "$ID" --append-notes "gate:review cleared by review-team @ $(date -u +%FT%TZ)"
```

If CHANGES REQUESTED: leave `gate:review` intact, loop back to impl
fix-up. Same escalation rules as heavy lane (after 3 passes, `bd
human <id>`).

## Action 3: `lite-merge` — CI green + gates cleared

```bash
ID="$1"
PR_URL="$(bd show "$ID" --json | jq -r '.[0].notes' | grep -oE 'https://github.com/[^[:space:]]+/pull/[0-9]+' | head -1)"
BRANCH="$(gh pr view "$PR_URL" --json headRefName -q .headRefName)"

# Preflight CI rollup (same logic as heavy lane).
ROLLUP="$(gh pr view "$PR_URL" --json statusCheckRollup \
  -q '.statusCheckRollup[] | "\(.status)\t\(.conclusion)\t\(.name)"')"
[ -z "$ROLLUP" ] && { echo "abort: no CI checks reported"; exit 1; }

INFLIGHT="$(echo "$ROLLUP" | awk -F'\t' '$1 != "COMPLETED" { print "  " $3 ": " $1 }')"
[ -n "$INFLIGHT" ] && { echo "abort: CI in flight:"; echo "$INFLIGHT"; exit 1; }

FAILED="$(echo "$ROLLUP" | awk -F'\t' '$1 == "COMPLETED" && $2 != "SUCCESS" && $2 != "SKIPPED" { print "  " $3 ": " $2 }')"
[ -n "$FAILED" ] && { echo "abort: CI not green:"; echo "$FAILED"; exit 1; }

# Gate check (no gate:pr in lite lane, so just look for residual gate:*)
REMAINING_GATES="$(bd show "$ID" --json | jq -r '.[0].labels[]? | select(test("^gate:"))' || true)"
[ -n "$REMAINING_GATES" ] && { echo "abort: bd gates still open: $REMAINING_GATES"; exit 1; }

STATUS="$(bd show "$ID" --json | jq -r '.[0].status')"
[ "$STATUS" != "in_review" ] && { echo "abort: bd status is '$STATUS', expected in_review"; exit 1; }

# Switch off the feat branch so we can delete it (no separate worktree
# to remove in the lite lane). Detached at origin/main is fine.
git fetch origin main
git checkout --detach origin/main

# Merge. Same --no-delete-branch + explicit cleanup as heavy lane
# (gh's --delete-branch fails when main is held by a sibling worktree;
# see ADR 0010 + opening-pr-orchestrator pr-merge for the why).
gh pr merge "$PR_URL" --squash

SHA="$(git ls-remote origin main | awk '{print $1}')"
bd close "$ID" --reason "Merged in $SHA"
bd dolt push

git push origin --delete "$BRANCH" 2>/dev/null || true
git branch -D "$BRANCH" 2>/dev/null || true

git fetch origin main
git checkout --detach origin/main   # ensure local view matches new main
```

## Escalation

Same as heavy lane (see [`opening-pr-orchestrator`](../opening-pr-orchestrator/SKILL.md#failure--escalation)):
- 2 consecutive CI fails → `bd human <id>`
- 3 review passes without approval → `bd human <id>`
- Merge conflict: rebase once, force-push the feat branch. Still conflicting → `bd human <id>`

## Why this exists

`opening-pr-orchestrator`'s 3-action heavy recipe is sized for parallel
multi-agent runs with audit-trail value. A solo operator burning through
a queue of small fixes paid ~10× the necessary overhead per issue (see
the 2026-05-27 6-issue run for the empirical motivation). The lite lane
matches the actual work shape for P2-P4 single-team issues: small,
sequential, low blast radius.

The heavy lane stays the default for anything `gate:qa`-tagged,
multi-team, P0/P1, or explicitly `lane:heavy` / `audit-trail`.

## Invariants

1. Orchestrator never writes to `main` directly — only via `gh pr merge`.
2. Branch protection still gates merges on `typecheck`/`lint`/`test`/`build`. The lite lane doesn't bypass any server-side requirement.
3. bd state is authoritative. PR is an artifact.
4. `bd dolt push` always runs after `bd close`. No exceptions — that's the cross-machine sync hook.
