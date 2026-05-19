# Team: frontend-impl-team

**Owned paths:** `apps/web/**`, `packages/qa/src/page-objects/**` (when added)
**Skills:** `svelte-frontend`, `superpowers:test-driven-development`, `superpowers:testing`

## Handoff in

Claims `bd` issues with `team:frontend-impl-team` in status `open` (i.e.
enriched and claimable — see ADR 0006).

## Handoff out

- Working code, tests passing locally (`bun --filter @url-cheat-sheet/web test`).
- Commits follow the conventional-commit style from `superpowers:committing`.
- Transitions issue to `in_review`, leaves it for orchestrator to run gates.

## Escalation rules

- New cross-package surface needed → ask `schemas-team` to add a schema first; do not invent inline types.
- Streaming changes that touch `packages/agent/**` → escalate to orchestrator; the agent team owns that path.

## Must-read constraints

Before writing code in `apps/web/**`, an implementer **must** have
absorbed:

- `CLAUDE.md` § "Hard rules" and § "Code style".
- The `svelte-frontend` skill — non-obvious patterns for state, Hono RPC,
  TanStack Query, and streaming chat in this codebase.
- This team's specific footguns:
  - **Svelte 5 runes over stores** for new components. Existing stores
    stay until the file is otherwise rewritten.
  - **No browser-only globals before client mount.** SSR runs once per
    request; `window` / `document` / `localStorage` access must be
    guarded (or moved into `onMount`).
  - **SvelteKit adapter runtime is `experimental_bun1.x`** — see ADR 0001.
    Don't add Node-runtime-only imports to server routes; flag if a dep
    requires Node and discuss with orchestrator.
