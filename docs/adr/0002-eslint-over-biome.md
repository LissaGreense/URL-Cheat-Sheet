# 0002 — ESLint 10 over Biome 2 for lint/format

**Status:** Accepted
**Date:** 2026-05-17

## Context

Biome 2.4 has matured into a credible all-in-one ESLint+Prettier replacement
with type-aware rules and ~15-50x speed. However, its Svelte rule coverage
is thinner than ESLint's, particularly for runes-aware checks.

## Decision

Use ESLint 10 + `eslint-plugin-svelte` + Prettier 3.8.

## Revisit when

`eslint-plugin-svelte`'s runes-aware rules are matched by Biome's Svelte
support. At that point, run a 1-week trial of Biome and switch if it holds.
