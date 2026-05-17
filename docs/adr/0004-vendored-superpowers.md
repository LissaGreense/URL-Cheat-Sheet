# 0004 — Vendor obra/superpowers in-tree

**Status:** Accepted
**Date:** 2026-05-17

## Context

The superpowers plugin defines the spine of our agentic workflow. We want
the option to edit any skill in-place when an upstream skill is wrong for
our case, without forking the whole plugin or losing the ability to ship.

## Decision

Vendor `obra/superpowers@v5.1.0` into `.claude/plugins/superpowers/`. The
exact source version lives in `VENDORED_VERSION` for upgrade tracking.

## Upgrade procedure

1. Read upstream release notes for new tag.
2. Re-run the vendor copy (per Plan Task 13).
3. Update `VENDORED_VERSION`.
4. Run the full CI + a smoke session that exercises brainstorming →
   writing-plans to confirm nothing local broke.

## Consequences

- We own all upgrades (no automatic plugin updates).
- Project skills under `.claude/skills/` continue to override by name and
  remain unaffected by upgrades.
