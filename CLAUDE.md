# CLAUDE.md — URL-Cheat-Sheet repo

## Always do first

1. Invoke the **`using-this-repo`** skill. It tells you the geography,
   the canonical workflow, and the hard rules.
2. Check `bd ready` to see what's claimable.
3. **Before any commit:** confirm `git rev-parse --abbrev-ref HEAD` is
   not `main`. If it is, branch first (`git checkout -b feat/<id>-<slug>`
   for pipeline work, `chore/<slug>` for one-shot cleanups).
4. **First time in a fresh clone or worktree:** run
   `bash scripts/setup-git-hooks.sh` to wire the version-controlled
   pre-push hook that blocks direct pushes to `main`. Verify with
   `git config core.hooksPath` (should print `scripts/git-hooks`).
5. **For local QA/eval runs:** copy `.env.example` to `.env` and fill
   in `ANTHROPIC_API_KEY`. Bun and Vite auto-load `.env` from the repo
   root, so the dev server and `bun --filter @url-cheat-sheet/evals
   eval <suite>` both pick up the key without further configuration.
   `.env` is gitignored. When you create a worktree, copy or symlink
   the parent repo's `.env` into it (`ln -s ../URL-Cheat-Sheet/.env
   .env`) — bun does not walk to sibling directories.

## Hard rules

- `bd` v1.x (>= 1.0.2): worktree-safe by default via git common-directory
  discovery — no flags needed. The legacy `--no-daemon` flag was removed
  upstream in v0.51.0 (Feb 2026) and now errors. Project prefix: `ucs`.
- `bun.lock` is the lockfile — never commit `bun.lockb`.
- SvelteKit adapter runtime: `experimental_bun1.x` (see ADR 0001).
- Zod 4: `z.strictObject()`, never `.strict()`. Unified `error` param.
- Vite 8 / Rolldown: `rolldownOptions`, never `rollupOptions`.
- Only the orchestrator spawns teams.
- **Never push to `main` directly.** All changes land via PR. The
  orchestrator opens the PR at worktree creation (see
  `opening-pr-orchestrator` skill) and merges after CI green + all
  `gate:*` labels cleared. Local pre-push hook
  (`scripts/git-hooks/pre-push`, wired via `setup-git-hooks.sh`)
  enforces this mechanically; see ADR 0005 for why a local hook
  rather than GitHub branch protection.
- QA team never fixes defects — files them only.

## Workflow stages → skills (canonical)

See `.claude/skills/using-this-repo/SKILL.md` § "Pipeline stages → skills" for
the table (13 rows, including the PR lifecycle stages added by ADR 0005).
The older `docs/specs/2026-05-17-agentic-workflow-skeleton.md` §8 has the
pre-supersession 9-row version; do not use it as the authoritative reference.

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
- `git push origin main` (or any direct write to `main`). The local
  pre-push hook blocks it; if it slips through (`--no-verify`, or
  hook not yet wired), treat it as a near-miss incident and file
  `bd create --type=bug --priority=0 --label=incident`.
