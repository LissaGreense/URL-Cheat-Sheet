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

Refuses any push whose remote ref is `refs/heads/main`. This is the active
enforcement mechanism for the **"never push to `main` directly"** hard rule
defined in [ADR 0005](../../docs/adr/0005-branch-first-and-branch-protection.md).

**Why a local hook instead of GitHub branch protection?**

GitHub gates both classic branch protection AND newer rulesets behind
GitHub Pro for private repositories. This repo is private and on the free tier.
The local pre-push hook is the free, version-controlled alternative.

**Equivalent server-side payload:** [`../branch-protection.json`](../branch-protection.json)
documents what the GitHub-side enforcement would look like if the repo ever
goes public or upgrades to Pro. Use it via:

```bash
gh api -X PUT repos/<owner>/<repo>/branches/main/protection \
  --input scripts/branch-protection.json
```

(Requires Pro or public repo.)

**Bypass for emergencies:** `git push --no-verify`. Don't use it; if you do,
file a `gate:incident` bd issue.

## Adding a new hook

1. Drop the executable script in `scripts/git-hooks/<hook-name>` (must match
   one of git's hook names: `pre-commit`, `pre-push`, `commit-msg`, etc.)
2. `chmod +x` it.
3. Update this README's "Active hooks" section.
4. Open a PR.

Anyone with `core.hooksPath` already wired picks up new hooks automatically.
