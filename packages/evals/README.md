# `@url-cheat-sheet/evals`

Runs the project's promptfoo eval suites and snapshots results into
`docs/evals/<suite>-<date>.md`.

## Usage

From the repo root:

```bash
bun run eval url-grounding
```

Or directly:

```bash
bun packages/evals/src/run.ts <suite-name>
```

`<suite-name>` is a directory under `packages/evals/suites/`.

## Env loading

The harness needs `ANTHROPIC_API_KEY` (and any other provider keys the suite
uses) reachable from the `promptfoo` subprocess. `run.ts` resolves it in this
order, last-write-wins:

1. **Repo-root `.env`** — `<repo>/.env` is parsed and merged in.
2. **`process.env`** — anything already exported in the parent shell
   overrides values from `.env`.

The merged map is passed to `spawnSync` as the child process's `env`.

Why the explicit load: Bun auto-loads `.env` from the subprocess `cwd`, and
the eval runner pins `cwd` to `packages/evals/` so `bunx` resolves the
workspace-installed `promptfoo` (and its workspace symlinks) instead of
downloading a stand-alone copy. The user-managed `.env` lives at the repo
root, so without this merge the child sees no key and every case fails with
an empty 0-token output. See `ucs-cv7` for the original symptom.

Exporting in the parent shell still works — and wins over a value in
`.env`, by design: if you want to override a key for one run, `export` is
the path of least surprise.

The `.env` file itself is user-managed and gitignored. Do not commit it
and do not put fixtures that look like real keys into source.
