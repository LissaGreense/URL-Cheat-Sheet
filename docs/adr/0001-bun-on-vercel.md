# 0001 — Bun runtime on Vercel (experimental)

**Status:** Accepted
**Date:** 2026-05-17

## Context

We use Bun for local dev and want a single runtime end-to-end. Vercel's
SvelteKit adapter (`@sveltejs/adapter-vercel@^6.3.3`) supports Bun via
`runtime: 'experimental_bun1.x'` but explicitly flags it as not for
production.

## Decision

Use `runtime: 'experimental_bun1.x'` in production today. Keep all server
code Web-standard (no Node-only APIs that lack Bun parity) so we can flip
the runtime string without a rewrite.

## Fallback procedure

If the experimental runtime misbehaves in production:

1. In `apps/web/svelte.config.js`, change `runtime: 'experimental_bun1.x'`
   to `runtime: 'nodejs24.x'`.
2. Add `"nodeVersion": "24.x"` to `vercel.json` and remove `"bunVersion"`.
3. Verify locally: `bun run build` still passes (we are not switching local
   dev, only the Vercel runtime).
4. Open a PR titled `revert(runtime): nodejs24.x fallback per ADR 0001`.

## Consequences

- We accept production risk from an explicitly experimental Vercel feature.
- We commit to keeping code Web-standard.
- We monitor [vercel/next.js#…](https://github.com/sveltejs/kit/issues/14879)
  and revisit when Bun-on-Vercel exits experimental.
