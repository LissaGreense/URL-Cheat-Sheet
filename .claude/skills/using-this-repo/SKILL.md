---
name: using-this-repo
description: Use at the start of any conversation in URL-Cheat-Sheet. Establishes how this repo is structured, where artifacts live, what skills/teams exist, and the canonical workflow stages.
---

# Using this repo

You are working in the URL-Cheat-Sheet monorepo. Before doing anything else:

1. **Read `docs/README.md`** — the canonical docs taxonomy. Every artifact has one home.
2. **Read `CLAUDE.md`** at the repo root — repo-wide agent rules.
3. **Check `bd ready`** — what's claimable right now.
4. **Know the pipeline** — the canonical 13-stage table is in this skill's "Pipeline stages → skills" section below. (The original 9-stage version in `docs/specs/2026-05-17-agentic-workflow-skeleton.md` §8 was superseded by `docs/specs/2026-05-18-agentic-pr-loop.md` once the PR-lifecycle stages were added.)

## Repo geography

- `apps/web/` — SvelteKit app (Vercel target)
- `packages/{schemas,agent,evals,qa}` — workspaces
- `.claude/plugins/superpowers/` — vendored skills, edit-in-tree
- `.claude/skills/` — project skills (override upstream by name)
- `.claude/teams/` — team specs
- `.beads/` — task DB (bd v1.x: worktree-safe by default; prefix `ucs`)
- `docs/` — every doc artifact (see `docs/README.md`)

## Branch-first

All work happens on `feat/<bd-id>-<slug>` branches. The orchestrator
opens the PR at worktree creation (`pr-open`), marks it ready when impl
completes (`pr-ready`), and merges after gates clear (`pr-merge`). See
the [`opening-pr-orchestrator`](../opening-pr-orchestrator/SKILL.md)
skill for the actual recipes.

Direct pushes to `main` are blocked by the version-controlled
**local pre-push hook** (`scripts/git-hooks/pre-push`, wired via
`scripts/setup-git-hooks.sh`). GitHub branch protection is unavailable
on the free-tier private setup, so server-side enforcement is opt-in
once the repo upgrades or goes public — see ADR 0005's 2026-05-18 and
2026-05-19 addendums. If you're not going through the full pipeline
(e.g., a one-shot doc fix), branch as `chore/<slug>` instead. For
merging chore PRs without the orchestrator, use
`bash scripts/safe-merge.sh <pr> [--wait]` so red CI can't slip
through (ucs-0z5).

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

## Plan-writing conventions

When writing a plan (`superpowers:writing-plans`) for this repo, **prefer
specifying interfaces over verbatim implementation code**. Plans here have
historically embedded full code blocks that the impl team is told to
follow literally — and several have been wrong in non-obvious ways (wrong
discriminated-union field names, `as const` narrowing surprises, type defs
that don't match the installed dep version). Each defect costs a fix-pass
and burns reviewer cycles.

For each task, write:

- **Function/method signatures** (types, return shape) — these are what
  the team owning the schemas (`.claude/teams/schemas-team.md`) and the
  team owning the implementation surface coordinate on.
- **Acceptance criteria** — what the function does, edge cases it handles.
- **Affected files** — paths and create/modify/delete intent.
- **Library calls — name the library + method, but DO NOT paste a call
  site verbatim unless you've just run it.** Library APIs drift; the
  impl agent should grep the installed `.d.ts` rather than copy from a
  plan written before the dep was upgraded. *This is the sharpest of
  the four bullets — three of the four ucs-mmj incidents traced to
  exactly this drift.*

Skip:

- Multi-line implementation bodies. The impl team writes those against
  the actual installed deps. If a plan does include a body, treat it as
  illustrative, not authoritative — the impl agent reconciles against
  the type-checker.
- Test bodies and fixture files. Generate during impl; freshness matters.

See ucs-mmj for the four-incident postmortem that motivated this rule.

## Hard rules

- `bd` v1.x (>= 1.0.2): worktree-safe by default — no flags needed. `--no-daemon` was removed upstream and errors.
- `bun.lock` is text (never commit `bun.lockb`).
- SvelteKit adapter runtime is `experimental_bun1.x`.
- Zod 4: use `z.strictObject()`, never `.strict()`.
- Vite 8: use `rolldownOptions`, never `rollupOptions`.
- Only the orchestrator spawns teams. No team spawns another team.
- **Never push to `main`.** All changes via PR. ADR 0005 has the rationale.
