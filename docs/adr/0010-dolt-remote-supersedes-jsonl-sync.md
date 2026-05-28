# ADR 0010: Dolt remote supersedes JSONL-in-git for bd sync

**Status:** accepted
**Date:** 2026-05-28
**Supersedes:** [ADR 0007](0007-stop-jsonl-drift-after-pr-merge.md)

## Context

ADR 0007 documented a workaround (drop the trailing `bd export` from
`pr-merge`) for `.beads/issues.jsonl` drift, while explicitly leaving
the bigger question of "stop tracking the JSONL" as future work
pending a Dolt remote. That ADR's Option 3 was the correct path; it
just wasn't taken at the time because no Dolt remote was configured.

In the months since, three things became clear:

1. **Upstream bd explicitly discourages the JSONL-in-git pattern.**
   `steveyegge/beads/docs/SYNC_CONCEPTS.md`: *"`.beads/issues.jsonl`
   is an export. It exists for viewers, interchange, migration, and
   backup. It is **not** the canonical cross-machine sync channel."*
   `GIT_INTEGRATION.md`: *"Beads data is stored in Dolt under
   `refs/dolt/data`, separate from standard Git refs."*
2. **The maintainer's own bd-using repos gitignore the JSONL.**
   `gastownhall/beads` and `gastownhall/gastown` (the bd flagship and
   author's main project, ~40k stars combined) both run with the
   JSONL gitignored and Dolt-as-canonical. The default `bd init`
   gitignore that tracks JSONL is a downstream-friendliness compromise,
   not the intended workflow.
3. **Multiple upstream bugs document exactly the friction this repo
   hits**: #797 (worktree pollution of `issues.jsonl`), #1379 (sync
   branch divergence on Windows), #831 (daemon doesn't actually pull),
   #1656 (sync flag inconsistency). Commit `7dc4cae` in this repo is
   a textbook instance of #797.

The `git+https://` (or `git+ssh://`) Dolt remote scheme stores Dolt
data under `refs/dolt/data` **inside the same GitHub repo** — no
DoltHub account, no separate Dolt server, no S3 bucket, no cost.
ADR 0007 didn't evaluate this scheme.

## Decision

1. **Configure `git+https://` Dolt remote on the same GitHub repo:**
   `bd dolt remote add origin git+https://github.com/LissaGreense/URL-Cheat-Sheet.git`.
   Authentication piggybacks on the `gh`/git credential helper already
   in use for the codebase. No additional secrets.

2. **Gitignore `.beads/issues.jsonl` and `.beads/interactions.jsonl`.**
   bd keeps auto-exporting them locally for `bv` viewer compatibility;
   git just stops tracking them.

3. **Wire Dolt sync into the orchestrator pipeline:**
   - `pr-open` (worktree bootstrap): `bd dolt pull` after the worktree
     is created. Ensures the new worktree sees the latest bd state
     (including issues claimed/closed by parallel orchestrators).
   - `pr-merge` (after `bd close`): `bd dolt push`. Publishes the
     closure to the remote `refs/dolt/data` immediately rather than
     waiting for a JSONL snapshot to ride along on the next PR.

4. **Drop the `.beads/` stash dance** from `pr-merge`. With the JSONL
   gitignored, `git pull --ff-only` no longer refuses on bd
   working-tree drift.

5. **Fresh-clone bootstrap:** `bd bootstrap` (or `bd dolt pull` after
   `bd init`) reconstructs local Dolt state from the remote. Document
   in `CLAUDE.md` under setup.

## Consequences

- **Positive:** Eliminates the JSONL pollution class of bug. Every
  subagent in the 6-issue 2026-05-27 run had to manually
  `git checkout .beads/issues.jsonl` before committing — this becomes
  unnecessary. Commit `7dc4cae`-class incidents become structurally
  impossible.
- **Positive:** Aligns with upstream's documented intent. Future bd
  upgrades are less likely to surprise.
- **Positive:** Zero recurring cost. Storage lives in the existing
  GitHub repo under a non-branch ref (`refs/dolt/data`), invisible to
  normal branch ops.
- **Positive:** Stash/drop dance removed; `pr-merge` recipe is
  shorter and clearer.
- **Trade-off:** Fresh clones need one explicit step (`bd dolt pull`
  or `bd bootstrap`) to populate local bd state. Documented in
  `CLAUDE.md`. For a solo operator who rarely clones, this is a
  one-time cost.
- **Trade-off:** PR diffs no longer show bd state changes. Audit
  trail for issue lifecycle now lives in the Dolt commit history
  (`bd dolt log`) rather than git history of `issues.jsonl`. The
  pipeline still surfaces lifecycle via PR comments + bd notes, so
  the operator-facing audit trail is unchanged.
- **Negative:** Parallel orchestrators on the *same* machine still
  share state via git common-directory discovery (bd v1.x worktree
  safety) — no change. Cross-machine parallelism now requires
  explicit `bd dolt pull`/`push` in the recipe.

## Migration

A one-time force-push was required to overwrite a stale `refs/dolt/data`
ref from a previous abandoned setup attempt (2026-05-17, 10 days
pre-migration). The local Dolt DB (118 issues, current closures) was
the canonical state; the remote ref was 10 days dead. Force-push
target was `refs/dolt/data` — outside GitHub's branch-protection
scope, no code branch affected.

## Alternatives reconsidered from ADR 0007

- **Option 2 — auto-chore PR per merge.** Still rejected; doubles PR
  count.
- **Option 3 — stop tracking + Dolt remote.** **Accepted, this ADR.**
  ADR 0007 deferred this only because the `git+https://` scheme
  wasn't on its radar.
- **Run `bd close` before squash-merge.** Not pursued; `bd dolt push`
  after `bd close` achieves the same self-healing without
  re-architecting the close timing.

## References

- [ADR 0007](0007-stop-jsonl-drift-after-pr-merge.md) — the workaround
  this supersedes.
- ADR 0005 — branch-first / PR lifecycle that triggers `pr-merge`.
- bd upstream: `github.com/steveyegge/beads`, docs/SYNC_CONCEPTS.md,
  docs/SYNC_SETUP.md, docs/GIT_INTEGRATION.md.
- `bd dolt --help` — local CLI surface.
- Commit `7dc4cae` — historical example of the bug class.
- `feedback_worktree_for_bd_ops` memory entry — operator-side
  workaround that becomes obsolete with this change.
