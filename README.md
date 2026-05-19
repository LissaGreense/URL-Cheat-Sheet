# URL Cheat Sheet

A web app where you drop a URL and chat with an agent that has read it.

## What's here

This repo is currently the **skeleton** — workflow infra, scaffolds, and CI.
The app itself (URL fetch + chat agent) is the first feature, to be
brainstormed using the workflow this skeleton ships.

## Quick start

```bash
bun install
bash scripts/setup-git-hooks.sh   # one-shot: wire pre-push hook (blocks push-to-main)
cp .env.example .env              # one-shot: fill in ANTHROPIC_API_KEY
bun run dev                       # SvelteKit on http://localhost:5173
```

`.env` is gitignored. Bun and Vite both auto-load it from the repo root,
so neither the dev server nor `bun --filter @url-cheat-sheet/evals eval <suite>`
needs the key exported in your shell. Agents driving the workflow rely
on this file so they can run QA and evals end-to-end without a human in
the loop.

## Run all CI checks locally

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```

## Layout

- `apps/web/` — SvelteKit (Vercel target)
- `packages/{schemas,agent,evals,qa}` — workspaces
- `docs/` — specs, plans, reviews, QA, evals, ADRs (see `docs/README.md`)
- `.claude/` — vendored superpowers, project skills, team specs
- `.beads/` — task DB (bd v1.x: worktree-safe by default, no flags needed)

## For agents

Read `CLAUDE.md` and invoke the `using-this-repo` skill first.

## Stack

Bun 1.3, TypeScript 6, SvelteKit 2.60 (Svelte 5 runes), Vite 8 + Rolldown,
Vitest 4, Vercel AI SDK v6, Zod 4, promptfoo. ESLint 10 + Prettier 3.8.
Deploy: Vercel with adapter-vercel `experimental_bun1.x` runtime.
