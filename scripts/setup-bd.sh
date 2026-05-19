#!/usr/bin/env bash
# One-shot: provision the custom bd statuses the agentic workflow expects.
# Run once per clone — the value lives in the local Dolt DB (not config.yaml)
# so it doesn't transfer across clones/worktrees on its own.
#
# Statuses (and why):
#   proposed   active   issue created from a plan, not yet enriched
#                       (intentionally invisible to `bd ready` — un-enriched
#                       work isn't claimable)
#   in_review  wip      PR ready, gates clearing
#
# Built-in `open` is the canonical "enriched and claimable" state — `bd ready`
# and `bv --robot-priority` only see active built-in statuses, so we route
# enriched issues back to `open` instead of inventing a custom synonym.
# See ADR 0006 for why the prior `enriched`/`ready` custom statuses were dropped.
#
# Without these, the task-creation, task-enrichment, and
# opening-pr-orchestrator skills error with
#   invalid status "proposed" (valid: open, in_progress, ...)
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

EXPECTED="proposed:active,in_review:wip"
CURRENT="$(bd config get status.custom 2>/dev/null | tail -1 | awk -F'= ' '{print $2}')"

if [ "$CURRENT" = "$EXPECTED" ]; then
  echo "✓ bd custom statuses already provisioned"
else
  bd config set status.custom "$EXPECTED"
  echo "✓ Set status.custom → $EXPECTED"
fi

echo
echo "Effective statuses:"
bd statuses 2>&1 | sed 's/^/  /'
