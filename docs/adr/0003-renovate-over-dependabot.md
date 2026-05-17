# 0003 — Renovate over Dependabot

**Status:** Accepted
**Date:** 2026-05-17

## Context

Dependabot gained Bun support in Feb 2025 (text `bun.lock` only), but has
known issues with Bun + npm workspaces (e.g. dependabot-core#14223). Renovate
has had Bun support longer, handles monorepo workspaces more reliably, and
exposes richer grouping / auto-merge policy.

## Decision

Use Renovate (`renovate.json`). Group AI SDK, Svelte stack, and dev tools.
Auto-merge patch updates. Pin 0.x packages exactly.

## Consequences

- Requires the Renovate GitHub App installed on the repo.
- Dependabot is disabled (no `.github/dependabot.yml`).
- Weekly `bun outdated` cron acts as a safety net (see `.github/workflows/outdated.yml`).
