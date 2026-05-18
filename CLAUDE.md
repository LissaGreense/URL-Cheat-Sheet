# CLAUDE.md — URL-Cheat-Sheet repo

## Always do first

1. Invoke the **`using-this-repo`** skill. It tells you the geography,
   the canonical workflow, and the hard rules.
2. Check `bd ready` to see what's claimable.

## Hard rules

- `bd` v1.x (>= 1.0.2): worktree-safe by default via git common-directory
  discovery — no flags needed. The legacy `--no-daemon` flag was removed
  upstream in v0.51.0 (Feb 2026) and now errors. Project prefix: `ucs`.
- `bun.lock` is the lockfile — never commit `bun.lockb`.
- SvelteKit adapter runtime: `experimental_bun1.x` (see ADR 0001).
- Zod 4: `z.strictObject()`, never `.strict()`. Unified `error` param.
- Vite 8 / Rolldown: `rolldownOptions`, never `rollupOptions`.
- Only the orchestrator spawns teams.
- QA team never fixes defects — files them only.

## Workflow stages → skills (canonical)

See `docs/specs/2026-05-17-agentic-workflow-skeleton.md` §8 for the table.

## Doc conventions

See `docs/README.md`. Every artifact has one home. No new folders without
an ADR.

## Code style

- TS strict, `verbatimModuleSyntax`, ES2023 target.
- Use JSDoc on exported functions and components.
- Prefer runes over stores in Svelte components.
- Composition over inheritance. Server-first, client when necessary.
- No barrel files unless genuinely necessary.

## Anti-patterns to refuse

- Mocking external services that we own end-to-end (use real integration tests).
- Premature abstractions before the third use.
- Speculative generality / "just in case" code.
- Passing `--no-daemon` to `bd` (the flag was removed upstream; it errors).
