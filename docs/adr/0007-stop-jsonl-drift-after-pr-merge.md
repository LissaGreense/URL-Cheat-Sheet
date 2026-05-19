# ADR 0007: Stop `.beads/issues.jsonl` drift after `pr-merge`

**Status:** accepted
**Date:** 2026-05-19
**bd issue:** ucs-lyf

## Context

`.beads/issues.jsonl` is git-tracked because, at present, **it is the
only inter-clone sync mechanism for bd state**: this project runs Dolt
in embedded mode (`bd dolt status` reports "not supported in embedded
mode") and `bd dolt remote list` shows no remotes configured. A fresh
clone reconstructs `bd` state by importing this file.

But `bd` also writes to the file as a side effect of nearly every read
and write. The `pr-merge` action in `opening-pr-orchestrator/SKILL.md`
amplified this by re-exporting the file explicitly at the end of the
recipe:

```bash
git stash push -m "wip bd state" .beads/issues.jsonl
git pull --ff-only
git stash drop
bd export -o .beads/issues.jsonl --no-memories   # ← drift source
```

The export wrote the post-close state (issue closed, `gate:pr` removed,
SHA-noted reason) on top of `origin/main`'s pre-close snapshot. The
working tree on `main` was left dirty after every merge. That dirty
file then leaked into the *next* worktree's bootstrap commit (via the
empty `chore: open draft PR` commit, which doesn't add files but
silently carried the diff along until the next `git add` cleaned it up
or it noised the PR review). Across the 10-issue URL-fetcher run on
2026-05-19, the operator manually `git checkout`'d the file before each
new worktree — every cycle, by hand.

## Decision

**Drop the trailing `bd export` from the `pr-merge` recipe.** The
post-close state lives in bd's Dolt DB and gets picked up by the next
PR's bd auto-commits (the first `bd update --status in_progress` of
the next cycle re-writes the file from current Dolt state, which now
includes the previous PR's close). So the snapshot trails by exactly
one cycle and self-heals.

We keep the stash / pull / stash-drop dance unchanged — that's
necessary so `git pull --ff-only` doesn't refuse mid-merge when bd's
auto-commit wrote to the working tree during the close.

## Consequences

- **Positive:** Working tree is clean on `main` after every `pr-merge`.
  No more pre-worktree `git checkout` rituals.
- **Positive:** No new code paths. One line removed.
- **Trade-off:** The git-tracked snapshot trails bd's live Dolt state
  by up to one PR cycle. In practice the next PR's diff includes the
  catch-up state row(s). For a single-clone setup this is invisible.
  For a fresh clone synced between merges, the snapshot is N-1
  closures stale at most; not load-bearing for any current automation.
- **Negative:** If two simultaneous clones each merge their own PR
  before either pulls, neither sees the other's closure in the
  snapshot until a third bd op runs. Acceptable: this project has one
  active operator at a time; no parallel-merge workflow exists.

## Alternatives considered

- **Option 2 — auto-chore PR per merge:** generate a tiny chore PR
  carrying the post-close jsonl diff, safe-merge it in the
  background. Rejected: doubles the PR count for no real gain. Adds
  scheduling complexity (auto-merge requires the same gate enforcement
  the orchestrator already runs).

- **Option 3 — stop tracking `.beads/issues.jsonl` and rely on Dolt
  push/pull for cross-clone sync:** the cleanest long-term answer.
  Rejected for *now* because no Dolt remote is configured (`bd dolt
  remote list` is empty) and the project runs Dolt in embedded mode.
  Setting up a Dolt remote is bigger than this fix's scope. Tracked
  as future work — once a remote exists, revisit and consider
  untracking the jsonl + adding `bd dolt push` / `pull` to the pipeline.

- **Run `bd close` BEFORE the squash-merge:** would let the close
  state land inside the impl branch's final commit, eliminating
  drift entirely. Rejected because the close `--reason` includes the
  merge SHA, which doesn't exist until after the merge. Workable but
  requires re-architecting the recipe; not worth it given Option 1's
  simplicity.

## References

- bd issue: ucs-lyf
- ADR 0005 — branch-first and the PR lifecycle that triggers `pr-merge`.
- ADR 0006 — prior `bd` workflow simplification (status model).
- `bd dolt` CLI surface: `bd dolt --help`.
