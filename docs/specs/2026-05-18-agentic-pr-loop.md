# Agentic PR Loop — Design

**Status:** draft (awaiting user review)
**Author:** brainstorming session, 2026-05-18
**Supersedes:** §8 row "Implementation → Code review → QA → Evals" of
[`2026-05-17-agentic-workflow-skeleton.md`](2026-05-17-agentic-workflow-skeleton.md)
**Related ADRs:** none yet; this spec will spawn ADR 0002 "Branch-first +
branch protection for `main`".

---

## 1. Motivation

The current canonical pipeline ends at "Evals → Learnings" with no explicit
PR stage. The orchestrator team spec only says "merge the worktree branch
into main" — it does not specify how, by whom, or under what gating. In
practice this gap caused a real incident on 2026-05-18: an agent (Claude
Opus 4.7) ran the SessionStart hook's terminal step `git push` directly
against `main` after a docs cleanup, bypassing the CI/QA workflows the
project just shipped.

Root causes:

1. The `bd prime` SessionStart hook output puts `git push` as step 4 of
   its "session close protocol" with no mention of branching. Hooks are
   loud and weight heavily in agent context.
2. `CLAUDE.md` had no hard rule against direct pushes to `main`.
3. GitHub branch protection on `main` was not configured.
4. The pipeline table in `using-this-repo` skill listed only logical
   workflow stages (review, QA, evals); the *mechanical* hand-off (PR
   create / mark-ready / merge) was implicit and undocumented.

This spec closes all four gaps with a single end-to-end design.

## 2. Scope

**In scope**

- Inserting PR-lifecycle stages into the canonical pipeline.
- Defining the three orchestrator actions (`pr-open`, `pr-ready`, `pr-merge`).
- Coupling bd issue state to PR state via labels and notes.
- Authoring a structured PR body (What / Why / How / Review passes).
- Hardening `main` via GitHub branch protection + required CI checks.
- Updating the SessionStart hook + project `CLAUDE.md` so agents cannot
  repeat the direct-push mistake.
- Defining recovery / escalation paths for the common failure modes.

**Out of scope**

- A dedicated GitHub App identity for the orchestrator (filed as a
  follow-up `gate:future` issue — see §8).
- Changing how implementation teams write code; this spec only touches
  the pre-impl (worktree+PR creation) and post-impl (gates+merge) edges.
- Changes to upstream `bd` or `superpowers` plugins. All overrides happen
  in `.claude/skills/` (project) and `scripts/`.
- Revising historical commits already on `main`.

## 3. Pipeline integration

Three new rows in the canonical pipeline table (rows 6a, 7b, 9). The
updated table:

| # | Stage | Skill | Trigger | Output |
|---|---|---|---|---|
| 1 | Brainstorm | `superpowers:brainstorming` | user request | spec in `docs/specs/` |
| 2 | Plan | `superpowers:writing-plans` | approved spec | plan in `docs/plans/` |
| 3 | Plan review | `superpowers:improving-plans` | draft plan | revised plan |
| 4 | Task creation | `task-creation` (project) | approved plan | bd issues, `proposed` |
| 5 | Task enrichment | `task-enrichment` (project) | `proposed` issues | issues, `enriched` |
| **6a** | **PR draft (new)** | `opening-pr-orchestrator` (project, new) | bd issue → `in_progress` and worktree created | draft PR on GitHub; PR URL recorded in bd notes |
| 7 | Implementation | `superpowers:subagent-driven-development` + team | claimed ready issue | commits on `feat/<id>-<slug>` branch |
| **7b** | **PR ready (new)** | inline orchestrator action | impl team reports done | PR transitions draft → ready; bd → `in_review` |
| 8 | Code review | `superpowers:reviewing-code` | `gate:review` | review verdict; review-pass counter incremented |
| 8a | QA | `qa-standard` (project) | `gate:qa` | QA report on PR; defects filed as bd children |
| 8b | Evals | `evals-promptfoo` (project) | `gate:evals` | eval snapshot in `docs/evals/` |
| **9** | **PR merge (new)** | inline orchestrator action | CI green + all `gate:*` cleared | squash-merge to `main`; bd issue closed; worktree removed |
| 10 | Learnings | `superpowers:remembering-learnings` | post-merge | curated learnings |

**Invariant:** the PR URL is stored on the bd issue (`bd update <id> --notes "PR: <url>"`) so any agent can find the artifact from the issue.

## 4. PR lifecycle — three orchestrator actions

Each is a one-shot shell action; no long-running process. All run inside
the worktree directory (`../wt-<id>` relative to the main repo).

### 4.1 `pr-open` (after worktree creation)

```bash
git push -u origin "feat/<id>-<slug>"
gh pr create \
  --draft \
  --base main \
  --head "feat/<id>-<slug>" \
  --title "<type>(<id>): <one-line summary from bd>" \
  --body "$(scripts/render-pr-body.sh <id>)"
PR_URL=$(gh pr view --json url -q .url)
bd update <id> --notes "PR: $PR_URL"
bd update <id> --status in_progress
```

### 4.2 `pr-ready` (when impl team reports success)

```bash
gh pr ready "$PR_URL"
bd update <id> --status in_review
bd update <id> --append-note "review-pass:1 — submitted by impl-team @ $(date -Is)"
```

This is the trigger that wakes up reviewer / QA / evals agents: they
look for issues in `in_review` carrying their `gate:*` label.

### 4.3 `pr-merge` (when all gates pass)

```bash
# Preflight (all must be true; first failure short-circuits)
gh pr checks "$PR_URL" --required | grep -v pass && exit 1
bd show <id> --json | jq -e '.labels | map(test("^gate:")) | any | not'
[ "$(bd show <id> --json | jq -r .status)" = "in_review" ]

# Merge
gh pr merge "$PR_URL" --squash --delete-branch
bd close <id> --reason="Merged in $(git rev-parse main)"
git worktree remove "../wt-<id>"
```

## 5. bd ↔ PR coupling

**Single source of truth: the bd issue.** The PR is an artifact. If they
disagree, bd wins. The orchestrator regenerates the PR body whenever bd
labels or status change.

### 5.1 Gate labels

| Label | Set by | Cleared by | Meaning |
|---|---|---|---|
| `gate:review` | task-enrichment | code-reviewer agent on approval | PR needs review approval |
| `gate:qa` | task-enrichment | qa agent on clean run | PR needs QA on preview deploy |
| `gate:evals` | task-enrichment | evals agent on suite pass | PR needs eval suite green |
| `gate:pr` *(new)* | orchestrator at `pr-open` | orchestrator at `pr-merge` | meta-gate, always last to clear |

Each agent finishes its work with:

```bash
bd update <id> --remove-label "gate:<their-gate>" \
               --notes "<gate>: pass — <evidence-link>"
```

### 5.2 Review-pass mechanic

The review loop is an explicit cycle. Each pass increments a counter
stored as append-only bd notes; the orchestrator displays the count in
the PR body.

```
pass-start (orchestrator, on pr-ready or after fix push):
  bd update <id> --append-note "review-pass:N — submitted by impl-team @ <ts>"
  bd update <id> --add-label "gate:review"
  bd update <id> --status in_review

pass-end (code-reviewer agent reports):
  if APPROVED:
    bd update <id> --append-note "review-pass:N — APPROVED by code-reviewer @ <ts>"
    bd update <id> --remove-label "gate:review"
  else (CHANGES_REQUESTED):
    bd update <id> --append-note "review-pass:N — CHANGES: <one-line> @ <ts>"
    bd update <id> --status in_progress   # back to impl team
    # gate:review stays set; next pr-ready starts pass N+1
```

Count formula:

```bash
bd show <id> --json | jq '.notes[] | select(.body | test("review-pass:")) | .body' \
  | grep "submitted" | wc -l
```

**Escalation:** review-pass count ≥ 3 without approval → orchestrator
runs `bd human <id>`. Prevents infinite reviewer ↔ impl ping-pong.

### 5.3 PR body template

Generated by `scripts/render-pr-body.sh <bd-id>` from bd issue JSON:

```markdown
## What changed
<written by impl team at `pr-ready` — bullets of code-level changes>

## Why
<pulled from bd issue body — motivation / acceptance criteria>

## How
<written by impl team at `pr-ready` — approach, key decisions, plan link>
Plan: docs/plans/<slug>.md

## Review passes
**Current pass:** N
- Pass 1 (YYYY-MM-DD): submitted by impl-team — <reviewer-verdict>
- Pass 2 (YYYY-MM-DD): submitted by impl-team — <reviewer-verdict>

## bd issue
[ucs-XXX](link)

## Gates
- [ ] review
- [ ] qa
- [ ] evals

🤖 Generated by orchestrator. Do not merge manually — bd-state wins.
```

The checkbox state in the PR body is **advisory display only**. The
authoritative check at merge time is the bd label query, not the
checkboxes. This keeps stale-looking PRs from confusing humans.

## 6. GitHub-side hardening

### 6.1 Branch protection rule on `main`

Applied via `gh api -X PUT repos/LissaGreense/URL-Cheat-Sheet/branches/main/protection`:

```yaml
required_pull_request_reviews:
  required_approving_review_count: 0   # bd labels are the authority
  dismiss_stale_reviews: true           # new push invalidates prior approvals
required_status_checks:
  strict: true                          # branch must be up-to-date before merge
  contexts:
    - typecheck
    - lint
    - test
    - build
required_linear_history: true           # squash-only
allow_force_pushes: false
allow_deletions: false
enforce_admins: false                   # keeps the repo owner's escape hatch
restrictions: null
```

Rationale:

- `required_approving_review_count: 0` — bd is the authority for review
  approval. GitHub's review state is decorative.
- `enforce_admins: false` — the repo owner (LissaGreense) retains a
  manual bypass for emergencies. Agents are not admins.
- `required_linear_history` + squash-only — keeps `git log main` flat
  and one commit per bd issue.

The exact JSON payload ships at `scripts/branch-protection.json`.

### 6.2 Required CI status checks

From the existing `ci.yml` job names (verified against the workflow on
`main` at the time of writing): `typecheck`, `lint`, `test`, `build`.
These four are required. Each one transitively requires the `install`
job, which is therefore not listed separately.

Explicitly excluded from required checks:

- `install` — transitive dependency of the four above; listing it
  separately is redundant.
- `eval-gate` (in `ci.yml`) — **conditional**, only runs when
  `packages/agent/**` or `packages/evals/**` is touched. GitHub's
  required-status-checks does not natively understand conditional jobs:
  a PR that does not touch those paths would hang waiting for a check
  that never runs. Eval quality is enforced via the `gate:evals` bd
  label and orchestrator preflight instead.
- `qa.yml` — conditional on `gate:qa`, orchestrator-driven. Posts
  comments rather than acting as a hard CI gate.
- `release.yml` — runs post-merge.
- `outdated.yml` — scheduled.

### 6.3 In-repo templates

| Path | Purpose |
|---|---|
| `.github/pull_request_template.md` | Empty fallback (What / Why / How / Review passes headings) for human-opened PRs. |
| `scripts/render-pr-body.sh` | Generates the structured body from bd issue JSON. Called by orchestrator. |
| `scripts/branch-protection.json` | Exact payload for `gh api … /branches/main/protection`. Reversible. |
| `.github/CODEOWNERS` | Intentionally omitted — bd labels do the routing. |

## 7. SessionStart hook + CLAUDE.md updates

### 7.1 SessionStart wrapper

New `scripts/session-prime.sh` prepends project protocol *before*
`bd prime` (order matters: earlier text gets higher weight in agent
context).

```bash
#!/usr/bin/env bash
cat <<'EOF'
# 🚨 URL-CHEAT-SHEET — BRANCH-FIRST PROTOCOL (overrides bd prime) 🚨

NEVER commit to `main` directly. Branch protection blocks pushes;
if a push somehow succeeds, file `bd create --type=bug --label=incident`
immediately and revert.

## Close protocol (replaces bd prime's checklist)
[ ] 1. git rev-parse --abbrev-ref HEAD     (confirm NOT on main)
[ ] 2. git status                          (what changed)
[ ] 3. git add <files>                     (stage)
[ ] 4. git commit -m "..."
[ ] 5. git push -u origin <branch>         (to PR branch, never main)
[ ] 6. Orchestrator handles `gh pr merge`  (or you do, via PR if one-shot)

## One-shot agents not going through the full pipeline
git checkout -b chore/<slug> → commit → push → gh pr create

EOF
bd prime
```

`.claude/settings.json` changes from `"command": "bd prime"` to
`"command": "./scripts/session-prime.sh"` in both the `SessionStart`
and `PreCompact` hooks.

### 7.2 Project `CLAUDE.md` deltas

Add to "Always do first":

> **Before any commit:** confirm `git rev-parse --abbrev-ref HEAD` is
> not `main`. If it is, branch first.

Add to "Hard rules":

> - **Never push to `main` directly.** All changes land via PR. The
>   orchestrator opens the PR at worktree creation (see
>   `opening-pr-orchestrator` skill) and merges after CI green + all
>   `gate:*` labels cleared.

Add to "Anti-patterns":

> - `git push origin main` (or any direct write to `main`). Branch
>   protection blocks it; if it slips through, treat it as a near-miss
>   incident.

### 7.3 `using-this-repo` skill deltas

- Replace the pipeline-stages table with the version in §3 of this spec.
- Add a "Branch-first" subsection after "Repo geography":

  > All work happens on `feat/<bd-id>-<slug>` branches. The orchestrator
  > opens the PR at worktree creation and merges after gates clear.
  > Direct pushes to `main` are blocked by GitHub branch protection.

### 7.4 New project skill: `opening-pr-orchestrator`

Location: `.claude/skills/opening-pr-orchestrator/SKILL.md`. Wraps
`superpowers:opening-pr` with bd coupling. Contains the three recipes
from §4 plus a pointer to `scripts/render-pr-body.sh`.

## 8. Recovery & failure modes

| Failure | Detection | Recovery | Escalation |
|---|---|---|---|
| CI fails on PR | `gh pr checks` non-pass after impl reports done | bd `in_review` → `in_progress`; PR stays draft; note `ci-fail: <check> @ <ts>` | After 2 consecutive CI fails on the same PR: `bd human <id>` |
| Review-pass cap hit | counter ≥ 3 without approval | Loop stops; PR remains open with `gate:review` set | `bd human <id>` immediately |
| Gate stalls | `gate:*` unchanged > 2h with bd in `in_review` | Re-spawn the responsible agent once (idempotent — agents read bd state) | If still stalled: `bd human <id>` |
| Merge conflict | `gh pr merge` returns conflict | `git rebase main` on worktree; force-push to `feat/*` (only sanctioned force-push) | If rebase has conflicts: `bd human <id>` with conflict file list; worktree preserved |
| bd ↔ PR divergence | Nightly audit script: open PRs whose bd is `closed`, or `in_review` bd with no PR | Audit script files `gate:incident` bd issues per drift | Always — divergence is never auto-fixed |
| Worktree orphaned | `git worktree list` shows worktrees whose bd is `closed` > 24h | `git worktree remove ../wt-<id>` automatically | None — pure cleanup, logged |
| Aborted PR (impl gives up) | bd transitioned to `blocked` / `proposed` while PR is open | `gh pr close <pr>` with abort comment; remove worktree | Logged; re-attempt requires fresh issue or explicit unblock |
| Force-push to `main` succeeds | Branch-protection bypass or misconfiguration | `bd create --type=bug --label=incident --priority=0`; no auto-revert (too risky) | `bd human <id>` immediately |

**Hard invariant:** orchestrator never modifies `main` directly. The
only writes to `main` are squash-merges via `gh pr merge`. Rebase
recovery always happens on the `feat/*` branch.

**Idempotency:** every recovery action is safe to re-run. The
orchestrator can be treated like cron — if it dies mid-task, the next
tick picks up where it left off without corrupting state.

## 9. Follow-ups (not in this spec)

| Item | Why deferred |
|---|---|
| Dedicated GitHub App for orchestrator identity | Filed as `gate:future` bd issue; current human-identity-as-orchestrator is fine for a single-developer repo. |
| Auto-rebase `main` into all open feat branches nightly | Adds noise; defer until we have ≥ 3 concurrent PRs. |
| PR-level cost telemetry (token usage per review pass) | Useful but premature; revisit after first 10 PRs go through the loop. |
| ADR 0002 "Branch-first + branch protection" | Will be written as part of the implementation plan that follows this spec. |

## 10. References

- Direct-push incident commit (the trigger for this spec): `7473b79` on `main`, 2026-05-18
- Pipeline skeleton spec: [`2026-05-17-agentic-workflow-skeleton.md`](2026-05-17-agentic-workflow-skeleton.md)
- Orchestrator team spec: [`../../.claude/teams/orchestrator.md`](../../.claude/teams/orchestrator.md)
- Beads worktree docs: https://github.com/steveyegge/beads/blob/main/docs/WORKTREES.md
- `superpowers:opening-pr` skill (upstream, wrapped by `opening-pr-orchestrator`)
