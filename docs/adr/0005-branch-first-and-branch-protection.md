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
