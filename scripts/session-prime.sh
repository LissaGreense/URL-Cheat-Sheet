#!/usr/bin/env bash
# SessionStart / PreCompact hook for URL-Cheat-Sheet.
# Prepends project protocol *before* bd prime so agent context weights
# the project rule higher than the upstream session-close checklist.
set -euo pipefail

cat <<'EOF'
# 🚨 URL-CHEAT-SHEET — BRANCH-FIRST PROTOCOL (overrides bd prime below) 🚨

**NEVER commit to `main` directly.** Branch protection blocks pushes;
if a push somehow succeeds, file `bd create --type=bug --priority=0
--label=incident` immediately and revert.

## Close protocol (replaces bd prime's checklist)

```
[ ] 1. git rev-parse --abbrev-ref HEAD     (confirm NOT on main)
[ ] 2. git status                          (what changed)
[ ] 3. git add <files>                     (stage)
[ ] 4. git commit -m "..."
[ ] 5. git push -u origin <branch>         (to PR branch, never main)
[ ] 6. Orchestrator handles `gh pr merge`  (or gh pr create if one-shot)
```

## One-shot agents not going through the full pipeline

```
git checkout -b chore/<slug> → commit → push → gh pr create
```

See ADR 0005 for rationale.

---

EOF

# Delegate to upstream bd prime for general bd context
bd prime
