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

## Stack-specific skills (installed via `npx skills add`)

These cover the actual libraries we use. Skills auto-activate on their triggers; the table below tells you when to expect them.

| Skill | When it kicks in |
|---|---|
| `ai-sdk` | Any work with `generateText`/`streamText`/`tool`/`Agent` (Vercel AI SDK v6). **Always check `node_modules/ai/docs/` — training-data knowledge of this SDK is stale.** |
| `svelte-core-bestpractices` | Writing/editing/analyzing any `.svelte` or `.svelte.ts` file (Svelte 5 runes, reactivity, performance). |
| `svelte-frontend` (project) | Project-specific Svelte conventions on top of the above (composes, doesn't replace). |
| `zod-validation-expert` | Authoring/reviewing Zod schemas, refinements, error handling. **Apply our v4 hard rules on top** (`z.strictObject()`, unified `error` param). |
| `promptfoo-evals` | Writing `promptfooconfig.yaml`, providers, assertions, rubrics. |
| `evals-promptfoo` (project) | Where snapshots land + when evals trigger (composes with above). |
| `deploy-to-vercel` | Anything user-facing about deployment / preview URLs / pushing live. |
| `bun` | Repo-wide build/install/test ops, esp. workspace operations. |

When project skills and stack skills overlap, project rules win on collisions.

## Hard rules

- `bd` always with `--no-daemon`.
- `bun.lock` is text (never commit `bun.lockb`).
- SvelteKit adapter runtime is `experimental_bun1.x`.
- Zod 4: use `z.strictObject()`, never `.strict()`.
- Vite 8: use `rolldownOptions`, never `rollupOptions`.
- Only the orchestrator spawns teams. No team spawns another team.
- AI SDK v6: training data is stale — read `node_modules/ai/docs/` before writing agent code.
