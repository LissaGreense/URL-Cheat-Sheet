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

# `bd config set status.custom` is a wholesale overwrite, not a merge — so
# re-running this script in a clone that still has the legacy 4-status set
# (`proposed,enriched,ready,in_review`) shrinks it to the new 2-status set
# in one shot. No data migration is needed in this repo: at the time of
# ADR 0006, zero issues were parked in `enriched`/`ready`.
if [ "$CURRENT" = "$EXPECTED" ]; then
  echo "✓ bd custom statuses already provisioned"
else
  bd config set status.custom "$EXPECTED"
  echo "✓ Set status.custom → $EXPECTED"
fi

echo
echo "Effective statuses:"
bd statuses 2>&1 | sed 's/^/  /'

# Provision the merge slot consumed by opening-pr-orchestrator's pr-merge
# action. Lets concurrent orchestrators serialize their merge phase so two
# pipelines don't race on the post-merge `git pull --ff-only` window.
# `bd merge-slot check` returns exit=0 in both "found" and "not found"
# cases, so we grep the message instead of relying on the exit code.
echo
if bd merge-slot check 2>&1 | grep -q "not found"; then
  bd merge-slot create
  echo "✓ Created bd merge slot"
else
  echo "✓ bd merge slot already provisioned"
fi
