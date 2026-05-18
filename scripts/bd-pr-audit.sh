#!/usr/bin/env bash
# Detect bd ↔ PR drift. Outputs one DRIFT line per case to stdout.
#
# bd JSON shape: notes is a plain string (or null), not an array.
# PR URL lines in notes match the pattern: "^PR: <url>"
#
# Drift cases detected:
#   1. bd issue is closed but its PR is still OPEN on GitHub.
#   2. bd issue is in_review but no PR URL is recorded in its notes.
#
# Inputs (overridable for tests via env vars):
#   BD_LIST_JSON    — JSON array of bd issues  (default: `bd list --all --json`)
#   GH_PR_LIST_JSON — JSON array of GH PRs     (default: `gh pr list --json url,state,title`)
set -euo pipefail

BD_LIST_JSON="${BD_LIST_JSON:-$(bd list --all --json 2>/dev/null || echo '[]')}"
GH_PR_LIST_JSON="${GH_PR_LIST_JSON:-$(gh pr list --json url,state,title 2>/dev/null || echo '[]')}"

# ---------------------------------------------------------------------------
# Drift type 1: bd issue closed but its PR is still OPEN
#
# Notes is a plain string; extract the PR URL from a line starting "PR: ".
# A notes field may contain multiple lines (appended via --append-notes).
# ---------------------------------------------------------------------------
echo "$BD_LIST_JSON" | jq -r '
  .[]
  | select(.status == "closed")
  | select(.notes != null and (.notes | test("(?m)^PR: ")))
  | . as $i
  | (.notes | split("\n")[] | select(test("^PR: ")) | ltrimstr("PR: ")) as $pr
  | "\($i.id)|\($pr)"
' | while IFS='|' read -r ID PR; do
  STATE="$(jq -r --arg url "$PR" '.[] | select(.url == $url) | .state' <<<"$GH_PR_LIST_JSON" 2>/dev/null || true)"
  if [ "$STATE" = "OPEN" ]; then
    echo "DRIFT: bd issue $ID is closed but PR $PR is still OPEN"
  fi
done

# ---------------------------------------------------------------------------
# Drift type 2: bd issue in_review but no PR URL recorded in notes
# ---------------------------------------------------------------------------
echo "$BD_LIST_JSON" | jq -r '
  .[]
  | select(.status == "in_review")
  | select(
      .notes == null
      or (.notes | test("(?m)^PR: ") | not)
    )
  | "DRIFT: bd issue \(.id) is in_review but no PR is recorded in notes"
'
