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
   Then run `bash scripts/setup-bd.sh` to provision the custom bd
   statuses (`proposed`, `in_review`), the merge slot, and the Dolt
   sync remote that the orchestrator pipeline depends on.
   (Built-in `open` is the canonical "enriched and claimable" state —
   see ADR 0006 for why we no longer use custom `enriched`/`ready`.)
   Both scripts are idempotent. After `setup-bd.sh` configures the
   Dolt remote, run `bd dolt pull` once to populate local bd state
   from the remote — fresh clones start with an empty Dolt DB and
   need this to see existing issues. See ADR 0010.
5. **For tasks that call a real model** (live QA on the chat UI, eval
   suites under `packages/evals/`, anything hitting `/api/chat` with an
   actual response): the project expects `ANTHROPIC_API_KEY` to be set
   in a local `.env` at the repo root. **Do not create, modify, or
   populate `.env`** — it's user-managed. If a key is needed and `.env`
   is absent or empty, stop and ask the user to fill it in. That's a
   valid stop point, not a workflow gap to engineer around.

## Hard rules

- `bd` v1.x (>= 1.0.2): worktree-safe by default via git common-directory
  discovery — no flags needed. The legacy `--no-daemon` flag was removed
  upstream in v0.51.0 (Feb 2026) and now errors. Project prefix: `ucs`.
- bd state is synced via a Dolt remote at `refs/dolt/data` on the
  same GitHub repo (see ADR 0010). `.beads/issues.jsonl` is gitignored;
  it's a local export for `bv` viewer compat, not the canonical state.
  Cross-machine sync uses `bd dolt pull` / `bd dolt push` — wired into
  the orchestrator's `pr-open` and `pr-merge` recipes.
- `bun.lock` is the lockfile — never commit `bun.lockb`.
- SvelteKit adapter runtime: `experimental_bun1.x` (see ADR 0001).
- Zod 4: `z.strictObject()`, never `.strict()`. Unified `error` param.
- Vite 8 / Rolldown: `rolldownOptions`, never `rollupOptions`.
- Only the orchestrator spawns teams.
- **Never push to `main` directly.** All changes land via PR. The
  orchestrator opens the PR at worktree creation (see
  `opening-pr-orchestrator` skill) and merges after CI green + all
  `gate:*` labels cleared. Enforcement is server-side: GitHub branch
  protection on `main` blocks direct pushes and gates merges on
  required CI checks (`typecheck`/`lint`/`test`/`build`). The local
  pre-push hook (`scripts/git-hooks/pre-push`, wired via
  `setup-git-hooks.sh`) is defense-in-depth — faster feedback before
  the round-trip. See ADR 0005 for the history.
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
- `git push origin main` (or any direct write to `main`). GitHub
  branch protection rejects it server-side; the local pre-push hook
  blocks it before the push attempt. If a push to `main` somehow
  succeeds (`--no-verify` against an unconfigured hook AND a server
  misconfig), treat it as a near-miss incident and file
  `bd create --type=bug --priority=0 --label=incident`.
