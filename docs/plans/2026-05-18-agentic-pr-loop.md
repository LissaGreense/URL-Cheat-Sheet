# Agentic PR Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the design in [`../specs/2026-05-18-agentic-pr-loop.md`](../specs/2026-05-18-agentic-pr-loop.md) — make PR creation a first-class pipeline stage, harden `main` against direct pushes, and couple bd issue state to PR state so the orchestrator can run the loop autonomously.

**Architecture:** Three layers, top-down. (1) Hard rules + ADR + protocol docs change agent behavior in every future session. (2) Project skills + team-spec deltas make the orchestrator capable of running the three PR actions (`pr-open`, `pr-ready`, `pr-merge`). (3) `scripts/` ship the actual bash that does the work, plus a `branch-protection.json` payload + GitHub Action for nightly bd↔PR drift detection.

**Tech Stack:** bash, `gh` CLI, `bd` v1.x, GitHub branch protection API, GitHub Actions, `jq`, Claude Code skill format (Markdown).

---

## File structure map

**Create (10 new files):**

- `docs/adr/0005-branch-first-and-branch-protection.md` — ADR
- `.claude/skills/opening-pr-orchestrator/SKILL.md` — wraps `superpowers:opening-pr` with bd coupling
- `.github/pull_request_template.md` — fallback for human-opened PRs
- `.github/workflows/bd-pr-audit.yml` — nightly drift check
- `scripts/session-prime.sh` — SessionStart hook wrapper
- `scripts/render-pr-body.sh` — generates PR body from bd issue
- `scripts/bd-pr-audit.sh` — detects bd ↔ PR drift
- `scripts/branch-protection.json` — payload for `gh api`
- `tests/scripts/render-pr-body.test.sh` — fixture-based test
- `tests/scripts/bd-pr-audit.test.sh` — fixture-based test

**Modify (5 existing files):**

- `CLAUDE.md` — add hard rule + always-do-first item + anti-pattern
- `.claude/skills/using-this-repo/SKILL.md` — replace pipeline table; add branch-first subsection
- `.claude/teams/orchestrator.md` — add PR actions, review-pass mechanic, recovery paths
- `.claude/settings.json` — swap `bd prime` for `./scripts/session-prime.sh`
- `docs/specs/2026-05-18-agentic-pr-loop.md` — fix ADR reference (0002 → 0005), flip status field to "approved" on close-out

**External (1 manual action):**

- Apply `scripts/branch-protection.json` via `gh api -X PUT` (one-shot; documented as Task 13)

---

## Tasks

### Task 1: Write ADR 0005 + fix spec ADR reference

**Files:**
- Create: `docs/adr/0005-branch-first-and-branch-protection.md`
- Modify: `docs/specs/2026-05-18-agentic-pr-loop.md` (two `ADR 0002` → `ADR 0005` references)

- [ ] **Step 1: Read existing ADRs to match style**

Run: `ls docs/adr/ && head -20 docs/adr/0001-bun-on-vercel.md`
Expected: 4 existing ADRs (0001-0004), confirm `# ADR <NNNN>: <title>` header pattern.

- [ ] **Step 2: Write ADR 0005**

Create `docs/adr/0005-branch-first-and-branch-protection.md`:

```markdown
# ADR 0005: Branch-first + branch protection for `main`

**Status:** accepted
**Date:** 2026-05-18
**Spec:** [../specs/2026-05-18-agentic-pr-loop.md](../specs/2026-05-18-agentic-pr-loop.md)

## Context

On 2026-05-18 an agent pushed commit `7473b79` directly to `main`, bypassing the `ci.yml` and `qa.yml` workflows the project had just shipped. Root cause: (1) the upstream `bd prime` SessionStart hook lists `git push` as a terminal "session close protocol" step with no mention of branching, and (2) no hard rule in `CLAUDE.md` forbade direct pushes, and (3) GitHub branch protection on `main` was not configured.

The agentic pipeline assumes every change flows through review / QA / evals gates — but those gates only fire on PRs. Without enforcement, the pipeline is advisory.

## Decision

1. **All changes land on `main` via PR only.** Direct pushes are forbidden by both convention (CLAUDE.md hard rule) and mechanism (GitHub branch protection).
2. **The orchestrator is the only actor that runs `gh pr merge`.** It enforces bd-side gates (every `gate:*` label cleared) on top of GitHub-side gates (CI green).
3. **bd is the single source of truth.** The PR is an artifact. If they disagree, bd wins. The orchestrator regenerates the PR body whenever bd state changes.
4. **`required_approving_review_count: 0`** in GitHub branch protection — review approval is tracked via the `gate:review` bd label, not via GitHub's native review state.
5. **`enforce_admins: false`** — the repo owner retains a manual escape hatch for emergencies. Agents are not admins, so they cannot bypass.
6. **Squash-only merges.** `required_linear_history: true` keeps `git log main` flat — one commit per bd issue.

## Consequences

- **Positive:** Direct-push regression is mechanically impossible for agents. Every change has an audit trail (PR + bd issue + review-pass notes). CI gates are enforced.
- **Negative:** Bootstrap PRs (like the one introducing this ADR) require manual approval before branch protection is applied — circular dependency resolved by applying protection in the same PR via maintainer merge.
- **Tradeoff:** Coupling bd labels to merge readiness means an agent crash mid-cycle can leave a PR with stale labels. Mitigated by the nightly bd↔PR audit script (§8 of the spec, Task 11 of this plan).

## Alternatives considered

- **GitHub-only enforcement** (require approving reviews, no bd coupling): rejected because it forces every PR to wait for a GitHub-side review even when the bd-side gates already passed. Doubles the wait without adding signal.
- **No branch protection, just convention**: rejected because the 2026-05-18 incident proved convention alone is insufficient against agentic mistakes.
- **Dedicated GitHub App identity for the orchestrator**: deferred. Adds operational complexity. Tracked as future work in the spec's §9.
```

- [ ] **Step 3: Patch spec ADR references**

Run: `rg -n 'ADR 0002' docs/specs/2026-05-18-agentic-pr-loop.md`
Expected: 2 hits (one in header, one in §9 follow-ups).

Edit both occurrences from `ADR 0002` to `ADR 0005`. In the §9 row, also change the "Will be written as part of the implementation plan" wording — it has been written now — to `Written; see [../adr/0005-branch-first-and-branch-protection.md](../adr/0005-branch-first-and-branch-protection.md).`

- [ ] **Step 4: Verify**

Run: `rg -n 'ADR (0002|0005)' docs/specs/2026-05-18-agentic-pr-loop.md docs/adr/0005-branch-first-and-branch-protection.md`
Expected: only `ADR 0005` references; zero `ADR 0002` references.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0005-branch-first-and-branch-protection.md docs/specs/2026-05-18-agentic-pr-loop.md
git commit -m "docs(adr): 0005 — branch-first + branch protection"
```

---

### Task 2: Update project CLAUDE.md (hard rules + anti-pattern)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read current state**

Run: `cat CLAUDE.md`
Expected: see "Always do first", "Hard rules", "Anti-patterns to refuse" sections.

- [ ] **Step 2: Add "always do first" guard**

Edit `CLAUDE.md` "## Always do first" section. After the existing two items (skill invocation, `bd ready`), add:

```markdown
3. **Before any commit:** confirm `git rev-parse --abbrev-ref HEAD` is
   not `main`. If it is, branch first (`git checkout -b feat/<id>-<slug>`
   for pipeline work, `chore/<slug>` for one-shot cleanups).
```

- [ ] **Step 3: Add the hard rule**

Edit "## Hard rules" section. Add as the second-to-last bullet (so it sits next to the existing orchestrator-only rule):

```markdown
- **Never push to `main` directly.** All changes land via PR. The
  orchestrator opens the PR at worktree creation (see
  `opening-pr-orchestrator` skill) and merges after CI green + all
  `gate:*` labels cleared. Branch protection on `main` enforces this
  mechanically (see ADR 0005).
```

- [ ] **Step 4: Add anti-pattern**

Edit "## Anti-patterns to refuse" section. Append as a new final bullet:

```markdown
- `git push origin main` (or any direct write to `main`). Branch
  protection blocks it; if it slips through, treat it as a near-miss
  incident and file `bd create --type=bug --priority=0
  --label=incident`.
```

- [ ] **Step 5: Verify**

Run: `rg -n 'main|branch-first|orchestrator' CLAUDE.md`
Expected: at least 3 hits referencing branch-first behavior.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): branch-first hard rule + anti-pattern"
```

---

### Task 3: Update `using-this-repo` skill (pipeline table + branch-first section)

**Files:**
- Modify: `.claude/skills/using-this-repo/SKILL.md`

- [ ] **Step 1: Read current state**

Run: `cat .claude/skills/using-this-repo/SKILL.md`
Expected: see "Pipeline stages → skills" table with 9 rows.

- [ ] **Step 2: Replace the pipeline table**

Replace the entire `## Pipeline stages → skills` section with:

```markdown
## Pipeline stages → skills

| # | Stage | Skill |
|---|---|---|
| 1 | Brainstorm | `superpowers:brainstorming` |
| 2 | Plan | `superpowers:writing-plans` |
| 3 | Plan review | `superpowers:improving-plans` |
| 4 | Task creation | `task-creation` (project) |
| 5 | Task enrichment | `task-enrichment` (project) |
| 6a | **PR draft** | `opening-pr-orchestrator` (project) |
| 7 | Implementation | `superpowers:subagent-driven-development` + team |
| 7b | **PR ready** | inline orchestrator action |
| 8 | Code review | `superpowers:reviewing-code` |
| 8a | QA (UI/UX) | `qa-standard` (project) |
| 8b | Evals (agent quality) | `evals-promptfoo` (project) |
| 9 | **PR merge** | inline orchestrator action |
| 10 | Learnings | `superpowers:remembering-learnings` |
```

- [ ] **Step 3: Add branch-first subsection**

Right after the "## Repo geography" section, insert a new section:

```markdown
## Branch-first

All work happens on `feat/<bd-id>-<slug>` branches. The orchestrator
opens the PR at worktree creation (`pr-open`), marks it ready when impl
completes (`pr-ready`), and merges after gates clear (`pr-merge`). See
the [`opening-pr-orchestrator`](../opening-pr-orchestrator/SKILL.md)
skill for the actual recipes.

Direct pushes to `main` are blocked by GitHub branch protection (see
ADR 0005). If you're not going through the full pipeline (e.g., a
one-shot doc fix), branch as `chore/<slug>` instead.
```

- [ ] **Step 4: Update the "Hard rules" section**

In the existing "## Hard rules" list, append:

```markdown
- **Never push to `main`.** All changes via PR. ADR 0005 has the rationale.
```

- [ ] **Step 5: Verify**

Run: `rg -n 'pr-open|pr-ready|pr-merge|branch-first|ADR 0005' .claude/skills/using-this-repo/SKILL.md`
Expected: at least 5 hits.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/using-this-repo/SKILL.md
git commit -m "docs(skill): using-this-repo — add PR pipeline stages + branch-first"
```

---

### Task 4: Create `scripts/render-pr-body.sh` (TDD)

**Files:**
- Create: `scripts/render-pr-body.sh`
- Create: `tests/scripts/render-pr-body.test.sh`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/render-pr-body.test.sh`:

```bash
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
```

Make executable: `chmod +x tests/scripts/render-pr-body.test.sh`

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/scripts/render-pr-body.test.sh`
Expected: FAIL with "No such file or directory" for `scripts/render-pr-body.sh`.

- [ ] **Step 3: Implement the script**

Create `scripts/render-pr-body.sh`:

```bash
#!/usr/bin/env bash
# Render a structured PR body from a bd issue.
# Usage: scripts/render-pr-body.sh <bd-id>
# Output: markdown on stdout.
set -euo pipefail

BD_ID="${1:?Usage: $0 <bd-id>}"

ISSUE_JSON="$(bd show "$BD_ID" --json)"
TITLE="$(jq -r .title <<<"$ISSUE_JSON")"
BODY="$(jq -r '.description // ""' <<<"$ISSUE_JSON")"
LABELS="$(jq -r '.labels[]? // empty' <<<"$ISSUE_JSON")"

# Pull review-pass entries from notes (chronological)
PASS_NOTES="$(jq -r '.notes[]? | .body | select(test("review-pass:"))' <<<"$ISSUE_JSON" || true)"
CURRENT_PASS="$(grep -c "submitted" <<<"$PASS_NOTES" 2>/dev/null || echo 0)"
[ -z "$PASS_NOTES" ] && PASS_NOTES="- Pass 1: not yet submitted"

# Format gate checkboxes from labels
gate_check() {
  local gate="$1"
  if grep -qx "gate:$gate" <<<"$LABELS"; then echo "- [ ] $gate"
  else echo "- [x] $gate"; fi
}

cat <<EOF
## What changed
<filled in by impl team at pr-ready>

## Why
$BODY

## How
<filled in by impl team at pr-ready>

## Review passes
**Current pass:** $CURRENT_PASS
$PASS_NOTES

## bd issue
[$BD_ID](../../.beads/issues.jsonl) — $TITLE

## Gates
$(gate_check review)
$(gate_check qa)
$(gate_check evals)

🤖 Generated by orchestrator. Do not merge manually — bd-state wins.
EOF
```

Make executable: `chmod +x scripts/render-pr-body.sh`

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/scripts/render-pr-body.test.sh`
Expected: `PASS: render-pr-body.sh emits all required sections`

- [ ] **Step 5: Visual sanity check**

Run: `./scripts/render-pr-body.sh ucs-6ci | head -25`
Expected: well-formed markdown with all four narrative sections plus bd issue + gates.

- [ ] **Step 6: Commit**

```bash
git add scripts/render-pr-body.sh tests/scripts/render-pr-body.test.sh
git commit -m "feat(scripts): render-pr-body.sh — structured PR body from bd issue"
```

---

### Task 5: Create `scripts/session-prime.sh` wrapper

**Files:**
- Create: `scripts/session-prime.sh`

- [ ] **Step 1: Write the failing test (inline check)**

Run: `./scripts/session-prime.sh 2>&1 | grep "BRANCH-FIRST"`
Expected: FAIL with "No such file or directory".

- [ ] **Step 2: Implement the wrapper**

Create `scripts/session-prime.sh`:

```bash
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
```

Make executable: `chmod +x scripts/session-prime.sh`

- [ ] **Step 3: Verify ordering and content**

Run: `./scripts/session-prime.sh 2>&1 | head -20`
Expected: project protocol block appears first; `bd prime` output appears below.

Run: `./scripts/session-prime.sh 2>&1 | grep -c "BRANCH-FIRST"`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add scripts/session-prime.sh
git commit -m "feat(scripts): session-prime.sh — branch-first protocol prepended to bd prime"
```

---

### Task 6: Wire `session-prime.sh` into `.claude/settings.json`

**Files:**
- Modify: `.claude/settings.json`

- [ ] **Step 1: Read current state**

Run: `cat .claude/settings.json`
Expected: see two hooks (`PreCompact` and `SessionStart`) each running `bd prime`.

- [ ] **Step 2: Replace both `bd prime` commands**

Edit `.claude/settings.json`. Change both occurrences of `"command": "bd prime"` to `"command": "./scripts/session-prime.sh"`.

Result:

```json
{
  "hooks": {
    "PreCompact": [
      {
        "hooks": [
          {
            "command": "./scripts/session-prime.sh",
            "type": "command"
          }
        ],
        "matcher": ""
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "command": "./scripts/session-prime.sh",
            "type": "command"
          }
        ],
        "matcher": ""
      }
    ]
  }
}
```

- [ ] **Step 3: Validate JSON**

Run: `jq . .claude/settings.json > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 4: Verify**

Run: `rg -n 'session-prime|bd prime' .claude/settings.json`
Expected: 2 `session-prime` hits, zero `bd prime` hits.

- [ ] **Step 5: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(claude): swap SessionStart hook from bd prime → session-prime.sh wrapper"
```

---

### Task 7: Create `opening-pr-orchestrator` project skill

**Files:**
- Create: `.claude/skills/opening-pr-orchestrator/SKILL.md`

- [ ] **Step 1: Create skill file**

Create `.claude/skills/opening-pr-orchestrator/SKILL.md`:

```markdown
---
name: opening-pr-orchestrator
description: Use when the orchestrator needs to open a draft PR for a newly-claimed bd issue, mark a PR ready when impl completes, or merge a PR after all gates clear. Wraps `superpowers:opening-pr` with bd-coupling protocol. Triggers on "open PR for bd issue", "mark PR ready", "merge PR".
---

# Opening PR (orchestrator)

Project wrapper around `superpowers:opening-pr` that couples PR state
to bd issue state. The orchestrator owns three discrete actions; each
is a one-shot shell sequence (no long-running process).

## Action 1: `pr-open` — draft PR at worktree creation

Run inside the worktree directory (`../wt-<id>`):

```bash
ID="$1"   # bd issue id, e.g. ucs-6ci
SLUG="$2" # kebab-case slug from issue title
TYPE="$3" # feat | fix | chore | docs

git push -u origin "feat/$ID-$SLUG"
gh pr create \
  --draft \
  --base main \
  --head "feat/$ID-$SLUG" \
  --title "$TYPE($ID): $(bd show $ID --json | jq -r .title)" \
  --body "$(../../scripts/render-pr-body.sh $ID)"
PR_URL="$(gh pr view --json url -q .url)"
bd update "$ID" --notes "PR: $PR_URL"
bd update "$ID" --status in_progress
bd update "$ID" --add-label "gate:pr"
```

## Action 2: `pr-ready` — mark ready when impl team reports done

```bash
ID="$1"
PR_URL="$(bd show $ID --json | jq -r '.notes[]? | .body | select(test("^PR: "))' | head -1 | cut -d' ' -f2)"
N=$(($(bd show "$ID" --json | jq '.notes[]? | .body | select(test("review-pass:.*submitted"))' | wc -l) + 1))

gh pr ready "$PR_URL"
gh pr edit "$PR_URL" --body "$(../../scripts/render-pr-body.sh $ID)"
bd update "$ID" --append-note "review-pass:$N — submitted by impl-team @ $(date -Is)"
bd update "$ID" --status in_review
```

## Action 3: `pr-merge` — squash-merge after gates clear

```bash
ID="$1"
PR_URL="$(bd show $ID --json | jq -r '.notes[]? | .body | select(test("^PR: "))' | head -1 | cut -d' ' -f2)"

# Preflight: every condition must hold or we abort
gh pr checks "$PR_URL" --required --json state -q '.[].state' | grep -qv '^SUCCESS$' && {
  echo "abort: CI not green"; exit 1; }

REMAINING_GATES="$(bd show $ID --json | jq -r '.labels[]? | select(test("^gate:"))' | grep -v '^gate:pr$' || true)"
[ -n "$REMAINING_GATES" ] && {
  echo "abort: bd gates still open: $REMAINING_GATES"; exit 1; }

STATUS="$(bd show $ID --json | jq -r .status)"
[ "$STATUS" != "in_review" ] && {
  echo "abort: bd status is '$STATUS', expected in_review"; exit 1; }

# Merge
gh pr merge "$PR_URL" --squash --delete-branch
SHA="$(git -C "$(git rev-parse --show-toplevel)" rev-parse main)"
bd update "$ID" --remove-label "gate:pr"
bd close "$ID" --reason "Merged in $SHA"
git worktree remove "../wt-$ID"
```

## Failure / escalation

See spec [§8](../../docs/specs/2026-05-18-agentic-pr-loop.md) and team
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
3. Every action is idempotent — re-running the same step on the same
   input must produce the same outcome.
```

- [ ] **Step 2: Verify skill loads**

Run: `head -5 .claude/skills/opening-pr-orchestrator/SKILL.md`
Expected: valid frontmatter with `name` and `description`.

- [ ] **Step 3: Verify markdown structure**

Run: `rg -c '^## (Action [0-9]+|Failure|Invariants)' .claude/skills/opening-pr-orchestrator/SKILL.md`
Expected: `5` (3 actions + 1 failure + 1 invariants).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/opening-pr-orchestrator/SKILL.md
git commit -m "feat(skill): opening-pr-orchestrator — bd-coupled PR lifecycle"
```

---

### Task 8: Update orchestrator team spec

**Files:**
- Modify: `.claude/teams/orchestrator.md`

- [ ] **Step 1: Read current state**

Run: `cat .claude/teams/orchestrator.md`
Expected: see "Handoff in", "Handoff out", "Escalation rules", "Hard rule" sections.

- [ ] **Step 2: Replace "Handoff out" section**

Replace the entire `## Handoff out` block with:

```markdown
## Handoff out

For each ready issue:

1. **Create worktree:** `git worktree add ../wt-<id> -b feat/<id>-<slug> main`
2. **`pr-open`:** invoke `opening-pr-orchestrator` skill, Action 1. Opens draft PR, records URL in bd notes, transitions bd → `in_progress`.
3. **Spawn team** named in the issue's `team:` label.
4. **`pr-ready`:** when team reports success, invoke skill Action 2. Marks PR ready, increments review-pass counter, transitions bd → `in_review`.
5. **Gate dispatch:** for each `gate:*` label, spawn the corresponding gate agent (review / qa / evals). Each clears its own label.
6. **`pr-merge`:** when all `gate:*` labels (except `gate:pr`) are cleared and CI is green, invoke skill Action 3. Squash-merges, closes bd, removes worktree.
```

- [ ] **Step 3: Add a "Recovery & escalation" section**

After "## Escalation rules", insert a new section:

```markdown
## Recovery & escalation (canonical table)

| Failure | Detection | Recovery | Escalation |
|---|---|---|---|
| CI fails on PR | `gh pr checks` returns non-pass after impl reports done | bd `in_review` → `in_progress`; PR stays draft; note `ci-fail: <check> @ <ts>` | After **2** consecutive CI fails on the same PR: `bd human <id>` |
| Review-pass cap | counter ≥ **3** without approval | Loop stops; PR remains open with `gate:review` set | `bd human <id>` immediately |
| Gate stalls | `gate:*` unchanged > **2h** with bd in `in_review` | Re-spawn the responsible agent once (idempotent) | If still stalled: `bd human <id>` |
| Merge conflict | `gh pr merge` returns conflict | `git rebase main` on worktree; force-push to `feat/*` (only sanctioned force-push) | If rebase has conflicts: `bd human <id>`; preserve worktree |
| bd ↔ PR divergence | Nightly `scripts/bd-pr-audit.sh` | Audit files `gate:incident` bd issues per drift | Always escalates |
| Worktree orphaned | `git worktree list` vs bd-`closed` for > 24h | `git worktree remove ../wt-<id>` automatically | None — pure cleanup, logged |
| Aborted PR | bd → `blocked`/`proposed` while PR open | `gh pr close` with abort comment; remove worktree | Logged; re-attempt requires fresh issue |
| Force-push to `main` succeeds | Branch-protection bypass | `bd create --type=bug --label=incident --priority=0`; no auto-revert | `bd human <id>` immediately |
```

- [ ] **Step 4: Add invariant to "Hard rule" section**

Replace the existing "## Hard rule" block with:

```markdown
## Hard rules

1. **Only the orchestrator spawns teams.** No team spawns another team.
2. **Orchestrator never writes to `main` directly.** All writes to `main` happen via `gh pr merge`, never `git push main`.
3. **Every action is idempotent.** Re-running the same step must produce the same outcome.
```

- [ ] **Step 5: Verify**

Run: `rg -n '(pr-open|pr-ready|pr-merge|Recovery|idempotent)' .claude/teams/orchestrator.md`
Expected: ≥ 6 hits.

- [ ] **Step 6: Commit**

```bash
git add .claude/teams/orchestrator.md
git commit -m "docs(team): orchestrator — PR actions + recovery table + idempotency invariant"
```

---

### Task 9: Create `scripts/branch-protection.json`

**Files:**
- Create: `scripts/branch-protection.json`

- [ ] **Step 1: Create the payload**

Create `scripts/branch-protection.json`:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["typecheck", "lint", "test", "build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

- [ ] **Step 2: Validate JSON**

Run: `jq . scripts/branch-protection.json > /dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: Verify required checks match ci.yml job names**

Run: `jq -r '.required_status_checks.contexts[]' scripts/branch-protection.json | sort > /tmp/required.txt && rg '^  [a-z]+:$' .github/workflows/ci.yml | grep -v install | grep -v 'eval-gate' | sed 's/[:[:space:]]//g' | sort > /tmp/actual.txt && diff /tmp/required.txt /tmp/actual.txt`
Expected: no diff output (means: each required context exists as a ci.yml job, modulo install/eval-gate exclusions).

- [ ] **Step 4: Commit**

```bash
git add scripts/branch-protection.json
git commit -m "feat(scripts): branch-protection.json — required checks + linear history"
```

---

### Task 10: Create `.github/pull_request_template.md`

**Files:**
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: Create the template**

Create `.github/pull_request_template.md`:

```markdown
## What changed
<!-- bullets of code-level changes -->

## Why
<!-- motivation / acceptance criteria; link the bd issue -->

## How
<!-- approach, key decisions, plan link -->
Plan: docs/plans/<slug>.md

## Review passes
**Current pass:** 1
- Pass 1 (YYYY-MM-DD): submitted by <author> — awaiting review

## bd issue
<!-- [ucs-XXX](link to issue) -->

## Gates
- [ ] review
- [ ] qa
- [ ] evals

---
🤖 If this PR was opened by the orchestrator, the body above will be
regenerated automatically by `scripts/render-pr-body.sh`. If you're a
human opening a one-shot PR, fill in the sections manually.
```

- [ ] **Step 2: Verify GitHub will pick it up**

Run: `ls -la .github/pull_request_template.md`
Expected: file present, ≥ 500 bytes.

- [ ] **Step 3: Commit**

```bash
git add .github/pull_request_template.md
git commit -m "feat(github): PR template fallback (What / Why / How / Review passes)"
```

---

### Task 11: Create `scripts/bd-pr-audit.sh` (TDD)

**Files:**
- Create: `scripts/bd-pr-audit.sh`
- Create: `tests/scripts/bd-pr-audit.test.sh`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/bd-pr-audit.test.sh`:

```bash
#!/usr/bin/env bash
# Test scripts/bd-pr-audit.sh by feeding it controlled inputs via env vars
# and verifying drift detection.
set -euo pipefail

SCRIPT="$(dirname "$0")/../../scripts/bd-pr-audit.sh"

# Fixture 1: no drift — empty PR list, empty bd issues → audit should pass silently
BD_LIST_JSON='[]' GH_PR_LIST_JSON='[]' OUTPUT="$("$SCRIPT")"
if [ -n "$OUTPUT" ]; then
  echo "FAIL: expected no output on empty inputs, got: $OUTPUT"
  exit 1
fi

# Fixture 2: drift — bd issue is closed but PR is still open
BD_LIST_JSON='[{"id":"ucs-test1","status":"closed","notes":[{"body":"PR: https://example.com/pr/1"}]}]'
GH_PR_LIST_JSON='[{"url":"https://example.com/pr/1","state":"OPEN","title":"x"}]'
OUTPUT="$(BD_LIST_JSON="$BD_LIST_JSON" GH_PR_LIST_JSON="$GH_PR_LIST_JSON" "$SCRIPT" || true)"
if ! grep -q "DRIFT" <<<"$OUTPUT"; then
  echo "FAIL: expected DRIFT in output, got: $OUTPUT"
  exit 1
fi

# Fixture 3: drift the other way — bd in_review but no PR recorded
BD_LIST_JSON='[{"id":"ucs-test2","status":"in_review","notes":[]}]'
GH_PR_LIST_JSON='[]'
OUTPUT="$(BD_LIST_JSON="$BD_LIST_JSON" GH_PR_LIST_JSON="$GH_PR_LIST_JSON" "$SCRIPT" || true)"
if ! grep -q "DRIFT" <<<"$OUTPUT"; then
  echo "FAIL: expected DRIFT for in_review-without-PR, got: $OUTPUT"
  exit 1
fi

echo "PASS: bd-pr-audit.sh detects both drift directions"
```

Make executable: `chmod +x tests/scripts/bd-pr-audit.test.sh`

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/scripts/bd-pr-audit.test.sh`
Expected: FAIL with "No such file or directory" for `scripts/bd-pr-audit.sh`.

- [ ] **Step 3: Implement the audit script**

Create `scripts/bd-pr-audit.sh`:

```bash
#!/usr/bin/env bash
# Detect bd ↔ PR drift. Outputs one DRIFT line per case to stdout.
# Inputs (overridable for tests via env vars):
#   BD_LIST_JSON   — JSON array of bd issues (default: `bd list --json`)
#   GH_PR_LIST_JSON — JSON array of GH PRs   (default: `gh pr list --json url,state,title`)
set -euo pipefail

BD_LIST_JSON="${BD_LIST_JSON:-$(bd list --status all --json 2>/dev/null || echo '[]')}"
GH_PR_LIST_JSON="${GH_PR_LIST_JSON:-$(gh pr list --json url,state,title 2>/dev/null || echo '[]')}"

# Drift type 1: bd issue closed but its PR is still OPEN
echo "$BD_LIST_JSON" | jq -r '
  .[]
  | select(.status == "closed")
  | . as $i
  | (.notes[]? | .body | select(test("^PR: ")) | sub("^PR: "; "")) as $pr
  | "\($i.id)|\($pr)"
' | while IFS='|' read -r ID PR; do
  STATE="$(jq -r --arg url "$PR" '.[] | select(.url == $url) | .state' <<<"$GH_PR_LIST_JSON" 2>/dev/null || true)"
  if [ "$STATE" = "OPEN" ]; then
    echo "DRIFT: bd issue $ID is closed but PR $PR is still OPEN"
  fi
done

# Drift type 2: bd issue in_review but no PR recorded in notes
echo "$BD_LIST_JSON" | jq -r '
  .[]
  | select(.status == "in_review")
  | select((.notes // []) | map(.body | test("^PR: ")) | any | not)
  | "DRIFT: bd issue \(.id) is in_review but no PR is recorded in notes"
'
```

Make executable: `chmod +x scripts/bd-pr-audit.sh`

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/scripts/bd-pr-audit.test.sh`
Expected: `PASS: bd-pr-audit.sh detects both drift directions`

- [ ] **Step 5: Smoke-test against real state**

Run: `./scripts/bd-pr-audit.sh`
Expected: empty output (no drift in current repo state) or one DRIFT line related to PR #3 if its bd issue is missing.

- [ ] **Step 6: Commit**

```bash
git add scripts/bd-pr-audit.sh tests/scripts/bd-pr-audit.test.sh
git commit -m "feat(scripts): bd-pr-audit.sh — detect bd ↔ PR state drift"
```

---

### Task 12: Create nightly audit workflow

**Files:**
- Create: `.github/workflows/bd-pr-audit.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/bd-pr-audit.yml`:

```yaml
name: bd-pr-audit

on:
  schedule:
    - cron: "0 7 * * *"   # 07:00 UTC daily
  workflow_dispatch:

permissions:
  contents: read
  issues: write
  pull-requests: read

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install bd
        run: |
          curl -fsSL https://gastownhall.github.io/beads/install.sh | sh
          echo "$HOME/.local/bin" >> $GITHUB_PATH
      - name: Install jq
        run: sudo apt-get update && sudo apt-get install -y jq
      - name: Run audit
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          DRIFT_OUTPUT="$(./scripts/bd-pr-audit.sh)"
          if [ -n "$DRIFT_OUTPUT" ]; then
            echo "::warning::bd ↔ PR drift detected"
            echo "$DRIFT_OUTPUT"
            echo "$DRIFT_OUTPUT" | while read -r LINE; do
              bd create \
                --title "audit: $LINE" \
                --type bug \
                --label "incident" \
                --priority 1 \
                --description "Auto-filed by .github/workflows/bd-pr-audit.yml. Investigate manually."
            done
            exit 1
          fi
          echo "no drift detected"
```

- [ ] **Step 2: Validate YAML**

Run: `bun x js-yaml .github/workflows/bd-pr-audit.yml > /dev/null && echo OK || python3 -c 'import yaml,sys; yaml.safe_load(open(".github/workflows/bd-pr-audit.yml"))' && echo OK`
Expected: `OK`

- [ ] **Step 3: Verify cron expression**

Run: `rg "cron:" .github/workflows/bd-pr-audit.yml`
Expected: `- cron: "0 7 * * *"`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/bd-pr-audit.yml
git commit -m "feat(ci): nightly bd ↔ PR drift audit"
```

---

### Task 13: Apply branch protection (manual one-shot)

**Files:**
- None modified (this is a GitHub-side action)

- [ ] **Step 1: Dry-run check**

Run: `gh api -X GET repos/LissaGreense/URL-Cheat-Sheet/branches/main/protection 2>&1 | head -5`
Expected: `404 Branch not protected` (or similar — confirms no existing protection).

- [ ] **Step 2: Apply protection**

Run:
```bash
gh api -X PUT repos/LissaGreense/URL-Cheat-Sheet/branches/main/protection \
  --input scripts/branch-protection.json
```
Expected: 200 OK with JSON echo of the applied protection rules.

- [ ] **Step 3: Verify protection is active**

Run: `gh api repos/LissaGreense/URL-Cheat-Sheet/branches/main/protection --jq '.required_status_checks.contexts'`
Expected: `["typecheck","lint","test","build"]`

- [ ] **Step 4: Attempt a direct push (negative test)**

Run from a clean checkout: `echo "test" >> /tmp/x && git push origin main 2>&1 | head -5`
Expected: `protected branch hook declined` or similar rejection.

- [ ] **Step 5: Record application in bd**

Run:
```bash
bd update <this-plan-issue-id> --append-note "branch protection applied $(date -Is)"
```

(No commit — this task touches only GitHub-side state.)

---

### Task 14: Smoke-test the full flow end-to-end

**Files:**
- None modified (verification only)

- [ ] **Step 1: Create a synthetic bd issue**

Run:
```bash
SMOKE_ID="$(bd create \
  --title "smoke: PR loop end-to-end test" \
  --type chore \
  --priority 4 \
  --description "Verifies the agentic PR loop. Delete after PR merges." \
  --json | jq -r .id)"
echo "Created $SMOKE_ID"
```

- [ ] **Step 2: Manually execute `pr-open` recipe**

```bash
git worktree add "../wt-$SMOKE_ID" -b "feat/$SMOKE_ID-smoke" main
cd "../wt-$SMOKE_ID"
echo "smoke" >> docs/SMOKE.txt && git add docs/SMOKE.txt && git commit -m "smoke commit"
git push -u origin "feat/$SMOKE_ID-smoke"
gh pr create --draft --base main --head "feat/$SMOKE_ID-smoke" \
  --title "chore($SMOKE_ID): smoke test" \
  --body "$(./scripts/render-pr-body.sh $SMOKE_ID)"
PR_URL="$(gh pr view --json url -q .url)"
bd update "$SMOKE_ID" --notes "PR: $PR_URL"
bd update "$SMOKE_ID" --status in_progress
```
Expected: draft PR opened, bd issue has PR URL in notes, status `in_progress`.

- [ ] **Step 3: Verify CI fires on the PR**

Run: `gh pr checks "$PR_URL" --watch` (waits until CI completes)
Expected: typecheck / lint / test / build all run; some may fail because deps aren't installed in CI — that's OK for this smoke test, we're just verifying triggers fire.

- [ ] **Step 4: Try `pr-merge` while CI is failing (negative test)**

Source the merge recipe inline (from `opening-pr-orchestrator` skill Action 3) and run with `$SMOKE_ID`.
Expected: aborts with `abort: CI not green`.

- [ ] **Step 5: Clean up**

```bash
gh pr close "$PR_URL" --delete-branch --comment "smoke test complete"
cd "$(git rev-parse --show-toplevel)"
git worktree remove "../wt-$SMOKE_ID"
bd close "$SMOKE_ID" --reason "smoke test passed"
rm -f docs/SMOKE.txt 2>/dev/null || true
```

- [ ] **Step 6: Document result**

Append a note to the plan's bd issue:
```bash
bd update <this-plan-issue-id> --append-note "smoke test passed at $(date -Is); PR was $PR_URL"
```

---

### Task 15: Flip spec status + close out

**Files:**
- Modify: `docs/specs/2026-05-18-agentic-pr-loop.md`

- [ ] **Step 1: Flip status field**

Edit the header of `docs/specs/2026-05-18-agentic-pr-loop.md`. Change:

```markdown
**Status:** draft (awaiting user review)
```

to:

```markdown
**Status:** accepted
**Implemented:** 2026-05-XX (this PR's merge date — fill at merge time)
**Implementation plan:** [../plans/2026-05-18-agentic-pr-loop.md](../plans/2026-05-18-agentic-pr-loop.md)
```

- [ ] **Step 2: Commit**

```bash
git add docs/specs/2026-05-18-agentic-pr-loop.md
git commit -m "docs(spec): flip agentic PR loop to accepted"
```

- [ ] **Step 3: Mark PR ready**

Run:
```bash
gh pr ready
```
Expected: PR #3 transitions draft → ready-for-review.

- [ ] **Step 4: Wait for orchestrator merge**

After this point the new flow takes over: code review / QA / evals run on this PR (or, since the very first run is bootstrap, you merge it manually as the repo owner). After merge, follow-up bd issues for the deferred items in spec §9 should be filed.

---

## Self-review notes

After writing this plan I checked the spec section-by-section against the tasks:

- §1 motivation — captured by ADR 0005 (Task 1)
- §2 scope — implicitly enforced by what tasks do and do not change
- §3 pipeline integration — Tasks 3, 8 (skill + team-spec deltas)
- §4 three orchestrator actions — Task 7 (skill with all three recipes)
- §5.1 gate labels — Tasks 7, 8 (skill recipes + team-spec table)
- §5.2 review-pass mechanic — Task 7 (Action 2 increments counter), Task 4 (render-pr-body reads counter)
- §5.3 PR body template — Task 4 (render-pr-body.sh), Task 10 (manual fallback)
- §6.1 branch protection — Tasks 9, 13
- §6.2 required CI checks — Task 9 (exact contexts) + verified in Step 3 against ci.yml job names
- §6.3 in-repo templates — Tasks 9, 10 (CODEOWNERS intentionally omitted, matches spec)
- §7.1 SessionStart wrapper — Tasks 5, 6
- §7.2 CLAUDE.md deltas — Task 2
- §7.3 using-this-repo deltas — Task 3
- §7.4 new opening-pr-orchestrator skill — Task 7
- §8 failure modes — Task 7 (in-skill quick reference) + Task 8 (canonical table in team spec)
- §9 follow-ups — ADR 0005 covers the ADR; GitHub App + nightly rebase deferred as bd issues (filed at merge time)

No spec section is unimplemented. Type/identifier consistency double-checked: every recipe in Task 7 uses the same variable names (`ID`, `PR_URL`, etc.) consistent with the orchestrator team spec changes in Task 8.

One placeholder is intentional — Task 15 Step 1 includes `2026-05-XX` because the merge date isn't knowable until merge time.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-05-18-agentic-pr-loop.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan because tasks are independent and the per-task scope is well-bounded.

2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch with checkpoints for review.

Which approach?
