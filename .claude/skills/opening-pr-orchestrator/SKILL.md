---
name: opening-pr-orchestrator
description: Use when the orchestrator needs to open a draft PR for a newly-claimed bd issue, mark a PR ready when impl completes, or merge a PR after all gates clear. Wraps `superpowers:opening-pr` with bd-coupling protocol. Triggers on "open PR for bd issue", "mark PR ready", "merge PR".
---

# Opening PR (orchestrator)

Project wrapper around `superpowers:opening-pr` that couples PR state
to bd issue state. The orchestrator owns three discrete actions; each
is a one-shot shell sequence (no long-running process).

## Action 1: `pr-open` — draft PR at worktree creation

Run inside the worktree directory (`../wt-<id>`):

```bash
ID="$1"   # bd issue id, e.g. ucs-6ci
SLUG="$2" # kebab-case slug from issue title
TYPE="$3" # feat | fix | chore | docs

git push -u origin "feat/$ID-$SLUG"
gh pr create \
  --draft \
  --base main \
  --head "feat/$ID-$SLUG" \
  --title "$TYPE($ID): $(bd show $ID --json | jq -r '.[0].title')" \
  --body "$(../../scripts/render-pr-body.sh $ID)"
PR_URL="$(gh pr view --json url -q .url)"
bd update "$ID" --notes "PR: $PR_URL"
bd update "$ID" --status in_progress
bd update "$ID" --add-label "gate:pr"
```

## Action 2: `pr-ready` — mark ready when impl team reports done

```bash
ID="$1"
PR_URL="$(bd show $ID --json | jq -r '.[0].notes[]? | .body | select(test("^PR: "))' | head -1 | cut -d' ' -f2)"
N=$(($(bd show "$ID" --json | jq '.[0].notes[]? | .body | select(test("review-pass:.*submitted"))' | wc -l) + 1))

gh pr ready "$PR_URL"
gh pr edit "$PR_URL" --body "$(../../scripts/render-pr-body.sh $ID)"
bd update "$ID" --append-note "review-pass:$N — submitted by impl-team @ $(date -Is)"
bd update "$ID" --status in_review
```

## Action 3: `pr-merge` — squash-merge after gates clear

```bash
ID="$1"
PR_URL="$(bd show $ID --json | jq -r '.[0].notes[]? | .body | select(test("^PR: "))' | head -1 | cut -d' ' -f2)"

# Preflight: every condition must hold or we abort
gh pr checks "$PR_URL" --required --json state -q '.[].state' | grep -qv '^SUCCESS$' && {
  echo "abort: CI not green"; exit 1; }

REMAINING_GATES="$(bd show $ID --json | jq -r '.[0].labels[]? | select(test("^gate:"))' | grep -v '^gate:pr$' || true)"
[ -n "$REMAINING_GATES" ] && {
  echo "abort: bd gates still open: $REMAINING_GATES"; exit 1; }

STATUS="$(bd show $ID --json | jq -r '.[0].status')"
[ "$STATUS" != "in_review" ] && {
  echo "abort: bd status is '$STATUS', expected in_review"; exit 1; }

# Merge
gh pr merge "$PR_URL" --squash --delete-branch
SHA="$(git -C "$(git rev-parse --show-toplevel)" rev-parse main)"
bd update "$ID" --remove-label "gate:pr"
bd close "$ID" --reason "Merged in $SHA"
git worktree remove "../wt-$ID"
```

## Failure / escalation

See spec [§8](../../docs/specs/2026-05-18-agentic-pr-loop.md) and team
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
3. Every action is idempotent — re-running the same step on the same
   input must produce the same outcome.
