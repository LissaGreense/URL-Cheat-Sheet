# Git hooks (version-controlled)

These hooks live in the repo and are activated by pointing git at this directory:

```bash
./scripts/setup-git-hooks.sh
# or, manually:
git config core.hooksPath scripts/git-hooks
```

Run once per clone. The setting persists in `.git/config` (per-clone, not in
version control), so fresh clones or new worktrees need to re-run it.

## Active hooks

### `pre-push`

Refuses any push whose remote ref is `refs/heads/main`. Defense-in-depth
mirror of GitHub's server-side branch protection on `main` — both block
the same thing, but the local hook fails before the round-trip to GitHub
and works offline. See [ADR 0005](../../docs/adr/0005-branch-first-and-branch-protection.md)
for the full history (the 2026-05-18 and 2026-05-19 addendums describe a
~48-hour private-tier window; the 2026-05-20 addendum is the current
state of the world).

**Bypass for emergencies:** `git push --no-verify`. Don't use it; if you do,
file a `gate:incident` bd issue.

## Adding a new hook

1. Drop the executable script in `scripts/git-hooks/<hook-name>` (must match
   one of git's hook names: `pre-commit`, `pre-push`, `commit-msg`, etc.)
2. `chmod +x` it.
3. Update this README's "Active hooks" section.
4. Open a PR.

Anyone with `core.hooksPath` already wired picks up new hooks automatically.
