#!/usr/bin/env bash
# Test scripts/render-pr-body.sh by feeding it the existing ucs-6ci issue
# and checking the output contains the four required sections.
set -euo pipefail

SCRIPT="$(dirname "$0")/../../scripts/render-pr-body.sh"
OUTPUT="$("$SCRIPT" ucs-6ci)"

assert_contains() {
  local needle="$1"
  if ! grep -q "$needle" <<<"$OUTPUT"; then
    echo "FAIL: output missing '$needle'"
    echo "--- output ---"
    echo "$OUTPUT"
    exit 1
  fi
}

assert_contains "## What changed"
assert_contains "## Why"
assert_contains "## How"
assert_contains "## Review passes"
assert_contains "## bd issue"
assert_contains "ucs-6ci"
assert_contains "## Gates"

echo "PASS: render-pr-body.sh emits all required sections"
