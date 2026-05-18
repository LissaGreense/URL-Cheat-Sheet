#!/usr/bin/env bash
# One-shot: wire the version-controlled hooks in scripts/git-hooks/ into git.
# Run once per clone (the core.hooksPath setting lives in .git/config which
# is not version-controlled, so it doesn't transfer across clones/worktrees).
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

git config core.hooksPath scripts/git-hooks
echo "✓ Wired core.hooksPath → scripts/git-hooks"
echo
echo "Active hooks:"
ls -1 scripts/git-hooks | grep -v README | sed 's/^/  - /'
