# Team: agent-impl-team

**Owned paths:** `packages/agent/**`
**Skills:** `ai-sdk` (primary — for any `generateText`/`streamText`/`tool`/`Agent` work), `zod-validation-expert` (tool I/O schemas, structured outputs), `superpowers:test-driven-development`, `superpowers:testing`, `evals-promptfoo` (project) + `promptfoo-evals` (general)

**On using `ai-sdk`:** the skill warns that training-data knowledge of the AI SDK is stale. Always consult `node_modules/ai/docs/` (the local-installed docs) before writing agent code. Never rely on remembered API shapes.

## Handoff in

Claims `bd` issues with `team:agent-impl-team` in status `ready`.

## Handoff out

- Tests passing (`bun --filter @url-cheat-sheet/agent test`).
- If the change is non-trivial, an eval suite update under `packages/evals/suites/`.
- Transitions issue to `in_review`.

## Escalation rules

- Schema changes → coordinate with `schemas-team` first.
- Frontend integration changes → escalate to orchestrator.
