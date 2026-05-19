# Team: agent-impl-team

**Owned paths:** `packages/agent/**`
**Skills:** `superpowers:test-driven-development`, `superpowers:testing`, `claude-api` (if available), `evals-promptfoo`

## Handoff in

Claims `bd` issues with `team:agent-impl-team` in status `open` (i.e. enriched
and claimable — see ADR 0006).

## Handoff out

- Tests passing (`bun --filter @url-cheat-sheet/agent test`).
- If the change is non-trivial, an eval suite update under `packages/evals/suites/`.
- Transitions issue to `in_review`.

## Escalation rules

- Schema changes → coordinate with `schemas-team` first.
- Frontend integration changes → escalate to orchestrator.

## Must-read constraints

Before writing code in `packages/agent/**`, an implementer **must** have
absorbed:

- `CLAUDE.md` § "Hard rules" and § "Code style" (Zod 4, Vite 8, TS strict,
  no barrel files, JSDoc on exports).
- This team's specific footguns:
  - **Do not import `undici`, `node:http.Agent`, or any TLS-overriding
    library.** Bun's SNI handshake breaks under those libs — see
    ucs-u47's postmortem. Use Bun's built-in `fetch`.
  - **`chatRequestSchema` stays `z.object`**, never `z.strictObject`.
    Existing chat-route tests don't send `document`; tightening to
    strict breaks them (see ucs-1fd). Add fields with `.optional()`,
    tighten only at consumer boundaries.
  - **Preserve the `as UIMessage[]` cast** in `/api/chat`. The
    `convertToCoreMessages` adapter mutates the array; the cast is
    documented type-narrowing, not legacy noise.
  - **`ANTHROPIC_API_KEY` check is load-bearing** — never remove it
    from `/api/chat`. Missing key must 503 with a clear message, not
    leak as an unhandled SDK error.
- The current `packages/evals/suites/` shape (if `gate:evals` is on the
  issue) — grep for the existing harness pattern, don't invent one.
