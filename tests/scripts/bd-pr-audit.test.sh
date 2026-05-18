#!/usr/bin/env bash
# Test scripts/bd-pr-audit.sh by feeding it controlled inputs via env vars
# and verifying drift detection.
#
# bd JSON shape (real): notes is a plain string (or null), not an array.
# PR URL is stored as a line matching "^PR: <url>" in the notes string.
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")/../.." && pwd)/scripts/bd-pr-audit.sh"

# ---------------------------------------------------------------------------
# Fixture 1: no drift — empty PR list, empty bd issues → audit should pass silently
# ---------------------------------------------------------------------------
OUTPUT="$(BD_LIST_JSON='[]' GH_PR_LIST_JSON='[]' "$SCRIPT")"
if [ -n "$OUTPUT" ]; then
  echo "FAIL: expected no output on empty inputs, got: $OUTPUT"
  exit 1
fi

# ---------------------------------------------------------------------------
# Fixture 2: drift — bd issue is closed but its PR is still OPEN
# notes is a plain string (real bd shape), not an array of objects
# ---------------------------------------------------------------------------
BD_LIST_JSON='[{"id":"ucs-test1","status":"closed","notes":"PR: https://example.com/pr/1"}]'
GH_PR_LIST_JSON='[{"url":"https://example.com/pr/1","state":"OPEN","title":"x"}]'
OUTPUT="$(BD_LIST_JSON="$BD_LIST_JSON" GH_PR_LIST_JSON="$GH_PR_LIST_JSON" "$SCRIPT" || true)"
if ! grep -q "DRIFT" <<<"$OUTPUT"; then
  echo "FAIL: expected DRIFT in output, got: $OUTPUT"
  exit 1
fi

# ---------------------------------------------------------------------------
# Fixture 3: drift the other way — bd in_review but no PR recorded in notes
# ---------------------------------------------------------------------------
BD_LIST_JSON='[{"id":"ucs-test2","status":"in_review","notes":null}]'
GH_PR_LIST_JSON='[]'
OUTPUT="$(BD_LIST_JSON="$BD_LIST_JSON" GH_PR_LIST_JSON="$GH_PR_LIST_JSON" "$SCRIPT" || true)"
if ! grep -q "DRIFT" <<<"$OUTPUT"; then
  echo "FAIL: expected DRIFT for in_review-without-PR, got: $OUTPUT"
  exit 1
fi

# ---------------------------------------------------------------------------
# Fixture 4 (no drift): in_review with a PR recorded → should be silent
# ---------------------------------------------------------------------------
BD_LIST_JSON='[{"id":"ucs-test3","status":"in_review","notes":"PR: https://example.com/pr/2"}]'
GH_PR_LIST_JSON='[{"url":"https://example.com/pr/2","state":"OPEN","title":"y"}]'
OUTPUT="$(BD_LIST_JSON="$BD_LIST_JSON" GH_PR_LIST_JSON="$GH_PR_LIST_JSON" "$SCRIPT" || true)"
if [ -n "$OUTPUT" ]; then
  echo "FAIL: expected no output for in_review with open PR, got: $OUTPUT"
  exit 1
fi

# ---------------------------------------------------------------------------
# Fixture 5 (no drift): bd closed + PR is MERGED (not OPEN)
# Semantics: "closed + OPEN PR" is the only drift case for closed issues.
# Other terminal PR states (MERGED, CLOSED) are healthy — bd state matches.
# ---------------------------------------------------------------------------
BD_LIST_JSON='[{"id":"ucs-test5","status":"closed","notes":"PR: https://example.com/pr/5"}]'
GH_PR_LIST_JSON='[{"url":"https://example.com/pr/5","state":"MERGED","title":"x"}]'
OUTPUT="$(BD_LIST_JSON="$BD_LIST_JSON" GH_PR_LIST_JSON="$GH_PR_LIST_JSON" "$SCRIPT" || true)"
if [ -n "$OUTPUT" ]; then
  echo "FAIL: fixture 5 expected no drift for closed+MERGED, got: $OUTPUT"
  exit 1
fi

echo "PASS: bd-pr-audit.sh detects both drift directions"
