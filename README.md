# URL Cheat Sheet

A web app where you drop a URL and chat with an agent that has read it.

## What's here

The first end-to-end slice ships: a chat UI grounded in **RFC 2324**
(Hyper Text Coffee Pot Control Protocol), bundled as a static text
file at build time. The backend agent has a single tool — `grep_rfc` —
that runs case-insensitive substring search over the RFC and returns
line-numbered hits with two lines of surrounding context. The model
(Claude Sonnet 4.6) cites line numbers inline in its answers.

URL fetching — the actual point of "URL Cheat Sheet" — is the next
slice. See [`docs/specs/2026-05-18-rfc2324-chat-mvp.md`](docs/specs/2026-05-18-rfc2324-chat-mvp.md)
for what's currently shipped and what's explicitly deferred to v2.

## Quick start

```bash
bun install
bash scripts/setup-git-hooks.sh   # one-shot: wire pre-push hook (blocks push-to-main)
bash scripts/setup-bd.sh          # one-shot: provision custom bd statuses for the agentic workflow
bun run dev                       # SvelteKit on http://localhost:5173
```

## Run all CI checks locally

```bash
bun run typecheck && bun run lint && bun run test && bun run build
```

## Merging a chore PR safely

`gh pr merge --auto` is unsafe in this repo: GitHub branch protection
isn't available on the free-tier private plan (see ADR 0005), so
auto-merge fires whenever the PR becomes mergeable in GitHub's eyes
regardless of CI conclusion. Use the wrapper instead:

```bash
bash scripts/safe-merge.sh <pr-number>            # refuses if any check is not SUCCESS/SKIPPED
bash scripts/safe-merge.sh <pr-number> --wait     # polls until CI completes, then merges
```

The orchestrator's `pr-merge` action already does this check for
feature PRs; the script is for chore PRs that don't go through the
orchestrator.

## Layout

- `apps/web/` — SvelteKit app (Vercel target). Chat UI at `/`, agent endpoint at `/api/chat`.
- `packages/agent/` — RFC text bundled at `src/data/rfc2324.txt`, `grep_rfc` tool, `streamChat` entry, system prompt.
- `packages/schemas/` — shared Zod schemas (chat request, message, QA case).
- `packages/evals/` — promptfoo runner + suites. Canary suite under `suites/canary/`.
- `packages/qa/` — reserved for QA test infra (skeleton).
- `docs/` — specs, plans, reviews, QA, evals, ADRs (see [`docs/README.md`](docs/README.md)).
- `scripts/` — one-shot setup (`setup-git-hooks.sh`, `setup-bd.sh`) and the chore-PR safe-merge wrapper.
- `.claude/` — vendored superpowers, project skills, team specs.
- `.beads/` — task DB (bd v1.x: worktree-safe by default, no flags needed).

## For agents

Read `CLAUDE.md` and invoke the `using-this-repo` skill first.

## Stack

Bun 1.3, TypeScript 6, SvelteKit 2.60 (Svelte 5 runes), Vite 8 + Rolldown,
Vitest 4, Vercel AI SDK v6, Zod 4, promptfoo. ESLint 10 + Prettier 3.8.
Deploy: Vercel with adapter-vercel `experimental_bun1.x` runtime.
