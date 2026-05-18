---
name: using-this-repo
description: Use at the start of any conversation in URL-Cheat-Sheet. Establishes how this repo is structured, where artifacts live, what skills/teams exist, and the canonical workflow stages.
---

# Using this repo

You are working in the URL-Cheat-Sheet monorepo. Before doing anything else:

1. **Read `docs/README.md`** — the canonical docs taxonomy. Every artifact has one home.
2. **Read `CLAUDE.md`** at the repo root — repo-wide agent rules.
3. **Check `bd ready`** — what's claimable right now.
4. **Know the pipeline** — see `docs/specs/2026-05-17-agentic-workflow-skeleton.md` §8.

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

Direct pushes to `main` are blocked by GitHub branch protection (see
ADR 0005). If you're not going through the full pipeline (e.g., a
one-shot doc fix), branch as `chore/<slug>` instead.

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

## Hard rules

- `bd` v1.x (>= 1.0.2): worktree-safe by default — no flags needed. `--no-daemon` was removed upstream and errors.
- `bun.lock` is text (never commit `bun.lockb`).
- SvelteKit adapter runtime is `experimental_bun1.x`.
- Zod 4: use `z.strictObject()`, never `.strict()`.
- Vite 8: use `rolldownOptions`, never `rollupOptions`.
- Only the orchestrator spawns teams. No team spawns another team.
- **Never push to `main`.** All changes via PR. ADR 0005 has the rationale.
