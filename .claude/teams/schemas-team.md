# Team: schemas-team

**Owned paths:** `packages/schemas/**`
**Skills:** `superpowers:test-driven-development`, `superpowers:testing`

## Handoff in

Claims `bd` issues with `team:schemas-team`.

## Handoff out

- New/changed Zod schemas with unit tests.
- Downstream consumers updated in the same commit set when breaking.
- Transitions issue to `in_review`.

## Escalation rules

- Breaking schema change with > 2 downstream consumers → escalate to orchestrator for a coordinated rollout.

## Must-read constraints

Before writing code in `packages/schemas/**`, an implementer **must**
have absorbed:

- `CLAUDE.md` § "Hard rules" — especially **Zod 4 idioms**.
- This team's specific footguns:
  - **`z.strictObject()`, never `.strict()`.** The chainable `.strict()`
    method was removed in Zod 4.
  - **Unified `error` parameter** — Zod 4 collapsed `errorMap`,
    `invalid_type_error`, `required_error` into a single `error`
    function. Use it.
  - **Schemas that cross the chat-route boundary stay `z.object`, not
    `z.strictObject`.** See `agent-impl-team`'s constraints for why —
    breaking existing tests is the wrong tradeoff.
  - **Test the schema, not its inferred type.** Use `.parse()` /
    `.safeParse()` round-trips against known-good and known-bad
    fixtures; don't use `expectTypeOf` as a stand-in for runtime tests.
  - **Discriminated unions over optional-flag polymorphism.** A
    schema with `{ kind: 'a' | 'b', payloadIfA?, payloadIfB? }` is a
    code smell — use `z.discriminatedUnion('kind', ...)` instead.
