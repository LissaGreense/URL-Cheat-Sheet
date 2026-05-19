---
name: opening-pr-orchestrator
description: Use when the orchestrator needs to open a draft PR for a newly-claimed bd issue, mark a PR ready when impl completes, or merge a PR after all gates clear. Wraps `superpowers:opening-pr` with bd-coupling protocol. Triggers on "open PR for bd issue", "mark PR ready", "merge PR".
---

# Opening PR (orchestrator)

Project wrapper around `superpowers:opening-pr` that couples PR state
to bd issue state. The orchestrator owns three discrete actions; each
is a one-shot shell sequence (no long-running process).

## Action 1: `pr-open` — draft PR at worktree creation

Run inside the worktree directory (`../wt-<id>`). Scripts live at the
worktree root (e.g. `scripts/render-pr-body.sh`) — the worktree is a
full working tree, no `../../` traversal needed.

A freshly-created worktree branch is identical to `main`, so GitHub
refuses `gh pr create` until at least one commit lands on the branch.
The recipe seeds an empty bootstrap commit so the PR can open before
the impl team writes any code.

```bash
ID="$1"   # bd issue id, e.g. ucs-6ci

# Derive SLUG and TYPE from the bd issue so pr-open is self-contained.
SLUG="$(bd show "$ID" --json | jq -r '.[0].title' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | tr -s '-' | sed 's/^-//;s/-$//')"
TYPE="$(bd show "$ID" --json | jq -r '.[0].issue_type' | sed 's/feature/feat/;s/bug/fix/;s/task/chore/')"

# Symlink the user-managed .env (per CLAUDE.md, never created by agents) so
# QA/eval gates that read ANTHROPIC_API_KEY from cwd work inside the worktree.
# Absolute target keeps the symlink valid even if the worktree dir is moved.
# .env is gitignored, so the symlink is never committed.
REPO_ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
[ -f "$REPO_ROOT/.env" ] && ln -sf "$REPO_ROOT/.env" .env

# Seed an empty commit so GH accepts the PR (it refuses no-diff PRs).
git commit --allow-empty -m "chore($ID): open draft PR for orchestrator tracking"

git push -u origin "feat/$ID-$SLUG"
gh pr create \
  --draft \
  --base main \
  --head "feat/$ID-$SLUG" \
  --title "$TYPE($ID): $(bd show "$ID" --json | jq -r '.[0].title')" \
  --body "$(scripts/render-pr-body.sh "$ID")"
PR_URL="$(gh pr view --json url -q .url)"
bd update "$ID" --notes "PR: $PR_URL"
bd update "$ID" --status in_progress
bd update "$ID" --add-label "gate:pr"  # meta-gate; cleared only in pr-merge after all other gates
```

## Action 2: `pr-ready` — mark ready when impl team reports done

Run inside the worktree directory.

bd stores `notes` as a single newline-delimited string, not an array,
so the PR URL extraction uses a regex over the raw text rather than
JSONL traversal. The timestamp uses portable `date -u +%FT%TZ` (GNU
`date -Is` is rejected by BSD date on macOS).

```bash
ID="$1"
PR_URL="$(bd show "$ID" --json | jq -r '.[0].notes' | grep -oE 'https://github.com/[^[:space:]]+/pull/[0-9]+' | head -1)"
N=$(($(bd show "$ID" --json | jq -r '.[0].notes' | grep -c '^review-pass:.*submitted') + 1))

gh pr ready "$PR_URL"
gh pr edit "$PR_URL" --body "$(scripts/render-pr-body.sh "$ID")"
bd update "$ID" --append-notes "review-pass:$N — submitted by impl-team @ $(date -u +%FT%TZ)"
bd update "$ID" --status in_review
```

## Action 3: `pr-merge` — squash-merge after gates clear

Starts inside the worktree, then transitions to the main repo root so
the worktree can be removed (git refuses to remove the worktree you're
standing in, and refuses to delete a branch held by a worktree).

This repo intentionally does NOT configure GitHub branch protection
required checks (see ADR 0005), so `gh pr checks --required` is always
empty here. The preflight reads `statusCheckRollup` directly and
treats `SKIPPED` as acceptable (e.g. `eval-gate` skips on non-agent PRs).

```bash
ID="$1"
PR_URL="$(bd show "$ID" --json | jq -r '.[0].notes' | grep -oE 'https://github.com/[^[:space:]]+/pull/[0-9]+' | head -1)"

# Preflight: every condition must hold or we abort.
ROLLUP="$(gh pr view "$PR_URL" --json statusCheckRollup -q '.statusCheckRollup[] | .conclusion')"
[ -z "$ROLLUP" ] && { echo "abort: no CI checks reported on $PR_URL"; exit 1; }
echo "$ROLLUP" | grep -qvE '^(SUCCESS|SKIPPED)$' && { echo "abort: CI not green"; exit 1; }

REMAINING_GATES="$(bd show "$ID" --json | jq -r '.[0].labels[]? | select(test("^gate:"))' | grep -v '^gate:pr$' || true)"
[ -n "$REMAINING_GATES" ] && { echo "abort: bd gates still open: $REMAINING_GATES"; exit 1; }

STATUS="$(bd show "$ID" --json | jq -r '.[0].status')"
[ "$STATUS" != "in_review" ] && { echo "abort: bd status is '$STATUS', expected in_review"; exit 1; }

# Step out of the worktree before removing it (git refuses to remove
# the worktree you're standing in or to delete a branch a worktree holds).
cd "$(git rev-parse --git-common-dir)/.."   # → main repo root
git worktree remove "../wt-$ID" --force

# Merge — safe to use --delete-branch now that the worktree is gone.
gh pr merge "$PR_URL" --squash --delete-branch
git fetch origin main
SHA="$(git ls-remote origin main | awk '{print $1}')"
bd update "$ID" --remove-label "gate:pr"
bd close "$ID" --reason "Merged in $SHA"

# Sync local main. Stash any .beads/issues.jsonl drift from the bd
# updates above so the fast-forward doesn't refuse; drop the stash so
# the working tree matches origin/main exactly.
#
# We intentionally do NOT re-export .beads/issues.jsonl here. bd's Dolt
# DB carries the post-close state; the jsonl snapshot trails by one
# cycle and catches up in the next PR's bd auto-commits. Re-exporting
# would leave the working tree dirty on main after every merge, and
# that drift then leaked into every subsequent worktree's bootstrap
# commit. See ADR 0007.
git stash push -m "wip bd state" .beads/issues.jsonl 2>/dev/null || true
git pull --ff-only
git stash drop 2>/dev/null || true
```

## Failure / escalation

See spec [§8](../../../docs/specs/2026-05-18-agentic-pr-loop.md) and team
spec [orchestrator.md](../../teams/orchestrator.md) for the full table.
Quick reference:

- **CI fails:** transition bd back to `in_progress`, leave PR draft. After 2 consecutive CI fails → `bd human <id>`.
- **Review-pass ≥ 3 without approval:** `bd human <id>` immediately.
- **Merge conflict:** rebase the `feat/*` branch once, force-push to it (only sanctioned force-push). If still conflicting → `bd human <id>`.
- **Force-push to `main` somehow succeeds:** `bd create --type=bug --label=incident --priority=0` with the SHA range. Never auto-revert.

## Invariants

1. Orchestrator never writes to `main` directly — only via `gh pr merge`.
2. bd issue state is authoritative. PR is an artifact. Regenerate the
   PR body whenever bd labels or notes change.
3. **Re-runnable from a clean state.** Recipes are safe to re-run after a
   prior step failed BEFORE the action completed — bd state is the
   authority for what's "done." Once an action has succeeded end-to-end,
   subsequent runs will error rather than corrupt state.
4. **Do not use `gh pr merge --auto`** for chore PRs you open outside
   the orchestrator pipeline. Auto-merge fires whenever the PR becomes
   mergeable in GitHub's eyes, regardless of CI conclusion (no GH
   required checks per ADR 0005). Use
   `bash scripts/safe-merge.sh <pr> [--wait]` — it runs the same
   `statusCheckRollup` preflight as Action 3 and refuses on red CI.
