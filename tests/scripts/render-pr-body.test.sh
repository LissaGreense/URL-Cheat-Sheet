#!/usr/bin/env bash
# Test scripts/render-pr-body.sh by feeding it the existing ucs-6ci issue
# and checking the output contains the four required sections, then by
# mocking bd to verify both branches of gate_check.
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

# --- Fixture 1: real bd issue (ucs-6ci) — no labels, no notes ---
assert_contains "## What changed"
assert_contains "## Why"
assert_contains "## How"
assert_contains "## Review passes"
assert_contains "## bd issue"
assert_contains "ucs-6ci"
assert_contains "## Gates"

# Review-passes placeholder body must be rendered, not just the heading.
assert_contains "\*\*Current pass:\*\* 0"
assert_contains "Pass 1: not yet submitted"

# --- Fixture 2: mocked bd with one gate label, to cover both branches of gate_check ---
TMP_BD_BIN="$(mktemp -d)"
trap 'rm -rf "$TMP_BD_BIN"' EXIT

cat > "$TMP_BD_BIN/bd" <<'BD'
#!/usr/bin/env bash
if [ "$1" = "show" ]; then
  cat <<'JSON'
[{"id":"ucs-mock","title":"mock","description":"mock body","labels":["gate:review"],"notes":[]}]
JSON
fi
BD
chmod +x "$TMP_BD_BIN/bd"

MOCK_OUTPUT="$(PATH="$TMP_BD_BIN:$PATH" "$SCRIPT" ucs-mock)"

# gate:review label is present → unchecked
grep -qxe "- \[ \] review" <<<"$MOCK_OUTPUT" || {
  echo "FAIL: gate:review label not rendered as unchecked"
  echo "--- output ---"; echo "$MOCK_OUTPUT"; exit 1
}
# gate:qa and gate:evals labels absent → checked
grep -qxe "- \[x\] qa" <<<"$MOCK_OUTPUT" || {
  echo "FAIL: missing gate:qa default-checked"
  echo "--- output ---"; echo "$MOCK_OUTPUT"; exit 1
}
grep -qxe "- \[x\] evals" <<<"$MOCK_OUTPUT" || {
  echo "FAIL: missing gate:evals default-checked"
  echo "--- output ---"; echo "$MOCK_OUTPUT"; exit 1
}

# --- Fixture 3: missing bd issue must error and exit non-zero ---
cat > "$TMP_BD_BIN/bd" <<'BD'
#!/usr/bin/env bash
if [ "$1" = "show" ]; then echo "[]"; fi
BD
chmod +x "$TMP_BD_BIN/bd"

if PATH="$TMP_BD_BIN:$PATH" "$SCRIPT" ucs-nope >/dev/null 2>&1; then
  echo "FAIL: script exited 0 for missing bd issue"
  exit 1
fi

echo "PASS: render-pr-body.sh emits all required sections and handles gates + missing issues"
