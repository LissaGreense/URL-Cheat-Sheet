#!/usr/bin/env bash
# Safe squash-merge for chore PRs that are not driven by the orchestrator.
# Wraps gh pr merge with a statusCheckRollup preflight so red CI cannot
# slip through — `gh pr merge --auto` does NOT enforce this in this repo
# because GitHub branch protection is unavailable on the free-tier
# private setup (see ADR 0005). ucs-0z5 is the bug this closes.
#
# Usage: bash scripts/safe-merge.sh <pr-number> [--wait]
#
# Exit codes:
#   0  merged
#   1  preflight failed (red CI, gates open, or not mergeable)
#   2  bad usage
set -euo pipefail

PR_NUM="${1:-}"
WAIT="false"
[ "${2:-}" = "--wait" ] && WAIT="true"

if [ -z "$PR_NUM" ]; then
  echo "usage: $0 <pr-number> [--wait]" >&2
  exit 2
fi

if [ "$WAIT" = "true" ]; then
  echo "→ waiting for CI to finish on PR #$PR_NUM..."
  while true; do
    STATUSES="$(gh pr view "$PR_NUM" --json statusCheckRollup -q '.statusCheckRollup[] | .status' 2>/dev/null || true)"
    if [ -n "$STATUSES" ] && ! echo "$STATUSES" | grep -qvE '^(COMPLETED|NEUTRAL)$'; then
      break
    fi
    sleep 15
  done
fi

ROLLUP="$(gh pr view "$PR_NUM" --json statusCheckRollup -q '.statusCheckRollup[] | "\(.name)=\(.conclusion)"' 2>/dev/null || true)"
if [ -z "$ROLLUP" ]; then
  echo "✗ abort: no CI checks reported on PR #$PR_NUM" >&2
  exit 1
fi

echo "CI conclusions:"
echo "$ROLLUP" | sed 's/^/  /'

CONCLUSIONS="$(gh pr view "$PR_NUM" --json statusCheckRollup -q '.statusCheckRollup[] | .conclusion')"
if echo "$CONCLUSIONS" | grep -qvE '^(SUCCESS|SKIPPED)$'; then
  echo "✗ abort: at least one check is not SUCCESS or SKIPPED" >&2
  exit 1
fi

STATE="$(gh pr view "$PR_NUM" --json mergeable -q .mergeable)"
if [ "$STATE" != "MERGEABLE" ]; then
  echo "✗ abort: PR is not MERGEABLE (state: $STATE)" >&2
  exit 1
fi

echo "→ merging PR #$PR_NUM (squash + delete-branch)..."
gh pr merge "$PR_NUM" --squash --delete-branch
echo "✓ merged"
