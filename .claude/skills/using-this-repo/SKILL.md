---
name: using-this-repo
description: Use at the start of any conversation in URL-Cheat-Sheet. Establishes how this repo is structured, where artifacts live, what skills/teams exist, and the canonical workflow stages.
---

# Using this repo

You are working in the URL-Cheat-Sheet monorepo. Before doing anything else:

1. **Read `docs/README.md`** — the canonical docs taxonomy. Every artifact has one home.
2. **Read `CLAUDE.md`** at the repo root — repo-wide agent rules.
3. **Check `bd --no-daemon ready`** — what's claimable right now.
4. **Know the pipeline** — see `docs/specs/2026-05-17-agentic-workflow-skeleton.md` §8.

## Repo geography

- `apps/web/` — SvelteKit app (Vercel target)
- `packages/{schemas,agent,evals,qa}` — workspaces
- `.claude/plugins/superpowers/` — vendored skills, edit-in-tree
- `.claude/skills/` — project skills (override upstream by name)
- `.claude/teams/` — team specs
- `.beads/` — task DB (always `bd --no-daemon`)
- `docs/` — every doc artifact (see `docs/README.md`)

## Pipeline stages → skills

| Stage | Skill |
|---|---|
| Brainstorm | `superpowers:brainstorming` |
| Plan | `superpowers:writing-plans` |
| Plan review | `superpowers:improving-plans` |
| Task creation | `task-creation` (project) |
| Task enrichment | `task-enrichment` (project) |
| Implementation | `superpowers:subagent-driven-development` + a team from `.claude/teams/` |
| Code review | `superpowers:reviewing-code` |
| QA (UI/UX) | `qa-standard` (project) |
| Evals (agent quality) | `evals-promptfoo` (project) |
| Learnings | `superpowers:remembering-learnings` |

## Hard rules

- `bd` always with `--no-daemon`.
- `bun.lock` is text (never commit `bun.lockb`).
- SvelteKit adapter runtime is `experimental_bun1.x`.
- Zod 4: use `z.strictObject()`, never `.strict()`.
- Vite 8: use `rolldownOptions`, never `rollupOptions`.
- Only the orchestrator spawns teams. No team spawns another team.
