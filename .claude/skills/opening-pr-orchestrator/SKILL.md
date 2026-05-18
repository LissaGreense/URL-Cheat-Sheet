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

```bash
ID="$1"   # bd issue id, e.g. ucs-6ci

# Derive SLUG and TYPE from the bd issue so pr-open is self-contained.
SLUG="$(bd show "$ID" --json | jq -r '.[0].title' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | tr -s '-' | sed 's/^-//;s/-$//')"
TYPE="$(bd show "$ID" --json | jq -r '.[0].issue_type' | sed 's/feature/feat/;s/bug/fix/;s/task/chore/')"

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

```bash
ID="$1"
PR_URL="$(bd show "$ID" --json | jq -r '.[0].notes[]? | .body | select(test("^PR: "))' | head -1 | cut -d' ' -f2)"
N=$(($(bd show "$ID" --json | jq '.[0].notes[]? | .body | select(test("review-pass:.*submitted"))' | wc -l) + 1))

gh pr ready "$PR_URL"
gh pr edit "$PR_URL" --body "$(scripts/render-pr-body.sh "$ID")"
bd update "$ID" --append-note "review-pass:$N — submitted by impl-team @ $(date -Is)"
bd update "$ID" --status in_review
```

## Action 3: `pr-merge` — squash-merge after gates clear

Starts inside the worktree (to read its checkout), but transitions to
the main repo root partway through so `git worktree remove` can delete
the worktree (git refuses to remove the worktree you're standing in).

```bash
ID="$1"
PR_URL="$(bd show "$ID" --json | jq -r '.[0].notes[]? | .body | select(test("^PR: "))' | head -1 | cut -d' ' -f2)"

# Preflight: every condition must hold or we abort.
# Empty --required output means branch protection is misconfigured (no checks declared) — fail closed.
CHECKS="$(gh pr checks "$PR_URL" --required --json state -q '.[].state')"
[ -z "$CHECKS" ] && { echo "abort: no required checks reported (branch protection misconfigured?)"; exit 1; }
echo "$CHECKS" | grep -qv '^SUCCESS$' && { echo "abort: CI not green"; exit 1; }

REMAINING_GATES="$(bd show "$ID" --json | jq -r '.[0].labels[]? | select(test("^gate:"))' | grep -v '^gate:pr$' || true)"
[ -n "$REMAINING_GATES" ] && {
  echo "abort: bd gates still open: $REMAINING_GATES"; exit 1; }

STATUS="$(bd show "$ID" --json | jq -r '.[0].status')"
[ "$STATUS" != "in_review" ] && {
  echo "abort: bd status is '$STATUS', expected in_review"; exit 1; }

# Step out of the worktree so we can remove it after the merge.
cd "$(git rev-parse --git-common-dir)/.."   # → main repo root

# Merge
gh pr merge "$PR_URL" --squash --delete-branch
SHA="$(git rev-parse main)"
bd update "$ID" --remove-label "gate:pr"
bd close "$ID" --reason "Merged in $SHA"
git worktree remove "../wt-$ID"
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
