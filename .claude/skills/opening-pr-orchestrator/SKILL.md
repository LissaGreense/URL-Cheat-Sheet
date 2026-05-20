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

# Tighten .beads/ perms to silence bd's "0755 (recommended: 0700)" warning that
# would otherwise fire on every bd invocation in this worktree. Git creates
# worktrees with 0755; bd expects 0700. Idempotent.
[ -d .beads ] && chmod 700 .beads

# Materialize workspace node_modules. `git worktree add` creates an independent
# working tree that does NOT share node_modules with the main repo, so the
# first `bun run`/`bunx vitest`/`bun packages/evals/...` invocation would
# otherwise fail with "Cannot find module". One-time per worktree, ~2s when
# the global Bun cache is warm. See ucs-mlf for the multi-task footprint
# that drove codifying this.
bun install

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

Branch protection (see ADR 0005, applied once the repo went public)
requires the four core checks: `typecheck`, `lint`, `test`, `build`.
The preflight reads `statusCheckRollup` directly rather than relying on
`gh pr checks --required`, and treats `SKIPPED` as acceptable so any
conditional or path-filtered jobs don't block merges. Evals run
locally only (see ADR 0008), so the rollup contains no eval check.

**Concurrency:** when more than one orchestrator may be active, the
action acquires `bd merge-slot` before the preflight so two pipelines
can't both pass "gates green" → merge → race on the post-merge `git
pull` window. The slot is released on every exit path via `trap`. The
slot itself is provisioned by `scripts/setup-bd.sh` (one-shot per
clone). If the slot is missing, `bd merge-slot acquire` errors with
`merge slot not found` — fix by re-running `setup-bd.sh`, not by
disabling the wrap.

```bash
ID="$1"
PR_URL="$(bd show "$ID" --json | jq -r '.[0].notes' | grep -oE 'https://github.com/[^[:space:]]+/pull/[0-9]+' | head -1)"

# Acquire the merge slot. Polls every 2s; registers as a waiter once for
# audit visibility (the queue is informational — first poller wins on
# release). Caps at 10 minutes; a held slot beyond that is almost
# certainly a crashed orchestrator that didn't release — escalate
# manually via `bd merge-slot release`.
bd merge-slot acquire --wait >/dev/null 2>&1 || true   # register intent (queue is informational)
ATTEMPTS=0
until bd merge-slot acquire >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -gt 300 ]; then
    echo "abort: merge slot held >10min — investigate, then 'bd merge-slot release' manually"
    exit 1
  fi
  sleep 2
done
trap 'bd merge-slot release >/dev/null 2>&1 || true' EXIT

# Preflight: every condition must hold or we abort.
#
# CheckRuns have separate `status` (lifecycle: COMPLETED / IN_PROGRESS /
# QUEUED / ...) and `conclusion` (verdict: SUCCESS / FAILURE / SKIPPED /
# ...). The conclusion is the empty string while the check is still
# running, so we must branch on `status == COMPLETED` first — otherwise
# an in-flight check (e.g. a freshly-retriggered job after a re-run)
# reads as `conclusion=""`, which the conclusion check would
# treat as "not SUCCESS" and abort spuriously. Three states:
#   1. No checks reported  → abort (PR isn't wired to CI yet).
#   2. Any check in flight → abort with "wait for CI" — re-run when done.
#   3. Any check failed    → abort with the specific failing checks.
ROLLUP="$(gh pr view "$PR_URL" --json statusCheckRollup \
  -q '.statusCheckRollup[] | "\(.status)\t\(.conclusion)\t\(.name)"')"
[ -z "$ROLLUP" ] && { echo "abort: no CI checks reported on $PR_URL"; exit 1; }

INFLIGHT="$(echo "$ROLLUP" | awk -F'\t' '$1 != "COMPLETED" { print "  " $3 ": " $1 }')"
if [ -n "$INFLIGHT" ]; then
  echo "abort: CI in flight — re-run pr-merge when checks complete:"
  echo "$INFLIGHT"
  exit 1
fi

FAILED="$(echo "$ROLLUP" | awk -F'\t' '$1 == "COMPLETED" && $2 != "SUCCESS" && $2 != "SKIPPED" { print "  " $3 ": " $2 }')"
if [ -n "$FAILED" ]; then
  echo "abort: CI not green:"
  echo "$FAILED"
  exit 1
fi

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

# Sync local main. Stash any .beads/ drift (issues.jsonl, metadata.json,
# config.yaml — anything bd may have auto-touched during the close
# above) so the fast-forward doesn't refuse; drop the stash so the
# working tree matches origin/main exactly.
#
# Stash scope is the whole .beads/ directory rather than just
# issues.jsonl: with concurrent orchestrators, another pipeline's bd
# writes can land in metadata.json or config.yaml during this window,
# and a narrower stash would let those slip through and make
# `git pull --ff-only` refuse. Runtime files in .beads/ (dolt/, locks,
# etc.) are gitignored so the stash skips them.
#
# We intentionally do NOT re-export .beads/issues.jsonl here. bd's Dolt
# DB carries the post-close state; the jsonl snapshot trails by one
# cycle and catches up in the next PR's bd auto-commits. Re-exporting
# would leave the working tree dirty on main after every merge, and
# that drift then leaked into every subsequent worktree's bootstrap
# commit. See ADR 0007.
git stash push -m "wip bd state" .beads/ 2>/dev/null || true
git pull --ff-only
git stash drop 2>/dev/null || true
```

## Gate clearance — reviewer protocol

Each `gate:*` label is cleared by the agent responsible for that gate
(review / qa / evals). The bd label removal is the **load-bearing**
clearance — without it `pr-merge` aborts. The PR-side approval (a GH
comment) is decorative but useful for audit trail.

For `gate:review` specifically, **do not run** `gh pr review --approve`:
GitHub refuses approval on PRs the actor opened
(`Can not approve your own pull request`), and the orchestrator opens
every pipeline PR. Use a plain comment instead:

```bash
ID="$1"
PR_URL="$(bd show "$ID" --json | jq -r '.[0].notes' | grep -oE 'https://github.com/[^[:space:]]+/pull/[0-9]+' | head -1)"

# Reviewer agent (or human reviewer) on approval:
gh pr comment "$PR_URL" --body "**gate:review** — APPROVED. <one-line rationale or pass count>"
bd update "$ID" --remove-label "gate:review"
bd update "$ID" --append-notes "gate:review cleared by <reviewer> @ $(date -u +%FT%TZ)"
```

If the reviewer requests changes instead of approving:

```bash
gh pr comment "$PR_URL" --body "**gate:review** — CHANGES REQUESTED. <findings>"
# Leave gate:review label intact; do NOT remove it.
# Increment review-pass counter; the orchestrator escalates at pass ≥ 3
# (see "Failure / escalation" below).
```

Same pattern for `gate:qa` and `gate:evals` — comment with the verdict,
then `--remove-label` only on green.

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
