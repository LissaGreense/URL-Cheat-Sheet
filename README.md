<img width="3392" height="1896" alt="image" src="https://github.com/user-attachments/assets/55b4a7f5-83e2-4f9e-b0b4-513875898e20" />


# URL Cheat Sheet

A web app where you drop a URL and chat with an agent that has read it.

## What's here

The end-to-end loop ships: paste a URL → server extracts main content
(SSRF-guarded fetch, prompt-injection scan via `vard`, Readability
parsing for clean text + heading outline) → cinematic UI walks the
user through 5 states (`idle`, `extracting`, `flagged`, `extract-error`,
`ready`) → chat panel streams responses from Claude Sonnet 4.6 with
four tools wired to the extracted document.

**Agent tools** (`packages/agent/src/tools/`):

- `outline` — heading structure with line numbers; call first to see what's covered.
- `grep_doc` — case-insensitive substring search with surrounding context; supports OR-union for synonym exploration.
- `read_lines` — up to 200 lines of raw text by 1-based range.
- `finalize` — client-side sentinel; the model emits it to end its turn with a non-empty answer + citations.

**API routes** (`apps/web/src/routes/api/`):

- `POST /api/extract` — fetch + SSRF guard + `vard` scan + Readability; returns typed `ExtractResponse` (text, title, sourceUrl, headings, byteSize, scan) or typed `ExtractError`.
- `POST /api/chat` — streaming chat via Vercel AI SDK v6.
- `GET /api/health` — liveness.

The BYO Anthropic key spec
([`docs/specs/2026-05-20-byo-anthropic-key.md`](docs/specs/2026-05-20-byo-anthropic-key.md))
is mid-flight — the `SettingsDrawer.svelte` component shipped, but
the wiring into `+page.svelte` (key bound into the chat request)
isn't done yet.

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

## Layout

- `apps/web/` — SvelteKit app (Vercel target). State-machine UI at `/`; `api/{chat,extract,health}` routes.
- `packages/agent/` — 4-tool agent (`outline`, `grep_doc`, `read_lines`, `finalize`), URL extract pipeline (`url/{fetch,sanitize,ssrf,extract}.ts`), system prompt, `streamChat` entry.
- `packages/schemas/` — shared Zod schemas (chat request, message, extract request/response, QA case).
- `packages/evals/` — promptfoo runner + suites. Canary suite under `suites/canary/`.
- `packages/qa/` — QA case loader (`parseCase` validates QA cases against the schema).
- `docs/` — specs, plans, reviews, QA, evals, ADRs (see [`docs/README.md`](docs/README.md)).
- `scripts/` — one-shot setup (`setup-git-hooks.sh`, `setup-bd.sh`) plus orchestrator helpers (`render-pr-body.sh`, `bd-pr-audit.sh`, `session-prime.sh`).
- `.claude/` — vendored superpowers, project skills, team specs.
- `.beads/` — task DB (bd v1.x: worktree-safe by default, no flags needed).

## For agents

Read `CLAUDE.md` and invoke the `using-this-repo` skill first.

## Stack

Bun 1.3, TypeScript 6, SvelteKit 2.60 (Svelte 5 runes), Vite 8 + Rolldown,
Vitest 4, Vercel AI SDK v6, Zod 4, promptfoo. ESLint 9 + Prettier 3.8.
Deploy: Vercel with adapter-vercel `experimental_bun1.x` runtime.
