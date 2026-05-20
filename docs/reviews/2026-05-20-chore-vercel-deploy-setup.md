# Review: chore/vercel-deploy-setup

**Date:** 2026-05-20
**Branch:** chore/vercel-deploy-setup
**PR:** #111
**Verdict:** Needs Work

## Summary

Adds on-demand Vercel deploy scripts to root `package.json`, disables
auto-deploys on `main` via `vercel.json`, and vendors three Vercel
agent-skills under `.claude/skills/`. Core change is three author-written
files (`vercel.json`, `package.json`, `skills-lock.json`); the other 158
files are vendored verbatim from `vercel-labs/agent-skills` and are out
of scope for line-review. Two ergonomic / scope issues flagged below;
both are mechanical to fix.

## Critical

None.

## Important

1. **`vercel` CLI is not declared as a dependency.** `bun run deploy` and
   `bun run deploy:prod` invoke `vercel deploy …`, but `vercel` is absent
   from root `package.json` devDependencies and from `apps/web/package.json`
   (only `@sveltejs/adapter-vercel` is there). The scripts only work today
   because the author has the CLI globally installed. A fresh clone runs
   into `command not found`.
   - **Fix:** add `"vercel": "^54"` (or a current pin) to root
     `devDependencies`.
   - **Worth doing: Yes** — one-line change that removes a "works on my
     machine" footgun. Cheap now, annoying later.

2. **`vercel-optimize` skill (96 files) is unused.** Of the three vendored
   skills, `deploy-to-vercel` and `vercel-cli-with-tokens` earn their keep
   (both are directly referenced by the new scripts' workflow).
   `vercel-optimize` is a complete static-analysis toolchain
   (`lib/`, `scripts/`, `references/`) for cost/perf audits that nothing
   in this repo invokes today and that no pipeline skill
   (`opening-pr-orchestrator`, `qa-standard`, `using-this-repo`)
   references. The PR body itself flags it as removable.
   - **Fix:** drop `.claude/skills/vercel-optimize/` and its
     `skills-lock.json` entry. Re-add via
     `npx skills add vercel-labs/agent-skills --skill vercel-optimize`
     when there's an actual need.
   - **Worth doing: Yes** — Karpathy #2 (Simplicity First). Vendoring 96
     files speculatively violates "no features beyond what was asked".

3. **No build-before-deploy invariant in the scripts.**
   `vercel deploy --no-wait` ships the current working tree to Vercel's
   builder without first verifying it typechecks, lints, or tests
   locally. A dirty branch with broken types can be deployed; the failure
   surfaces only in the remote build log.
   - **Worth doing: No** — this is a local on-demand CLI flow, not CI.
     Adding `bun run check && bun run lint && bun run test &&` in front
     would slow the common case (deploying a known-good preview) for a
     rare case (deploying a broken branch by accident). The `ci.yml`
     workflow still gates merges on `main`, and `main` no longer
     auto-deploys, so blast radius is contained to preview URLs. Worth a
     line in the PR body noting the assumption, nothing more.

## Tests

No test files in diff. The PR test plan is appropriate for a
config-only change (JSON parse check + one real end-to-end deploy that
landed `Ready` at https://url-cheat-sheet.vercel.app). No new test
infrastructure required.

## Needs Decision

- **Naming-collision check — clean.** No existing project skill shares a
  name with the three new ones (`beads-recipes`, `evals-promptfoo`,
  `opening-pr-orchestrator`, `qa-standard`, `svelte-frontend`,
  `task-creation`, `task-enrichment`, `using-this-repo` vs.
  `deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-optimize`).
  `deploy-to-vercel` does not shadow any pipeline skill — the pipeline
  has no deploy stage today.

- **ADR 0005 compliance — clean.** No `.github/workflows/` changes.
  Branch protection on `main` is untouched. Disabling Vercel's
  auto-deploy on `main` is orthogonal to (and consistent with) the
  "deploy is an explicit act" posture in ADR 0005.

- **First-deploy prod alias claim** (noted by author in the PR body):
  not actionable — Vercel default behavior for a project's first deploy.
  Future `--target preview` runs will get separate preview URLs.

## Relevant paths

- `vercel.json` — git.deploymentEnabled config
- `package.json` — new `deploy` + `deploy:prod` scripts (lines 24–25)
- `skills-lock.json` — three skill hashes
- `apps/web/svelte.config.js` — confirms `experimental_bun1.x` runtime
  is independent of the new vercel.json key
- `.claude/skills/vercel-optimize/` — 96 vendored files, candidate for
  removal per finding #2
