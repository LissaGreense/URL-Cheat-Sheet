# ADR 0005: Branch-first + branch protection for `main`

**Status:** accepted (with revised enforcement mechanism — see Addendum 2026-05-18)
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

## Addendum (2026-05-18): enforcement mechanism revised

After merge of the agentic-PR-loop PR, applying the planned GitHub branch protection
returned `403 — Upgrade to GitHub Pro or make this repository public to enable
this feature` for both the classic `branches/main/protection` endpoint and the
newer `rulesets` endpoint. GitHub gates server-side branch enforcement behind
GitHub Pro for private repositories.

Given the repo is private and on the free tier, we adopted a **local pre-push hook**
as the active enforcement mechanism:

- Hook source: [`../../scripts/git-hooks/pre-push`](../../scripts/git-hooks/pre-push)
- Wired via: [`../../scripts/setup-git-hooks.sh`](../../scripts/setup-git-hooks.sh)
  (one-shot per clone/worktree; sets `core.hooksPath`)

Properties relative to the original GitHub-side plan:

- ✅ Blocks `git push origin main` in any local environment where the hook is wired
  (which includes all agent invocations of `git push` in this repo).
- ✅ Version-controlled — the hook lives under `scripts/git-hooks/`, not in the
  gitignored `.git/hooks/`.
- ❌ Does NOT enforce on GitHub-side. If someone uses the web UI, the API, or pushes
  from an unconfigured clone, the rule is not enforced.
- ❌ Bypassable via `git push --no-verify` (this is deliberate — emergency escape
  matches the original `enforce_admins: false` intent).

**`scripts/branch-protection.json` is kept in the repo as a forward-looking
artifact** — the exact payload to apply if the repo ever goes public or upgrades
to Pro. See [`../../scripts/git-hooks/README.md`](../../scripts/git-hooks/README.md)
for both paths.

CI-side enforcement (required status checks: `typecheck`, `lint`, `test`, `build`)
is unaffected by the Pro gate — those run on every PR via `ci.yml` and a PR
cannot be merged through the UI if they fail. So even without server-side
branch protection, CI gates ARE enforced on PRs; the local hook just prevents
the "no PR at all" failure mode.
