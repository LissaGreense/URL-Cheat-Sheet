---
name: task-enrichment
description: Use after `task-creation` has populated `bd` with `proposed` issues. Walks the plan and adds acceptance criteria, affected files, a `team:` label, and any `gate:` labels per issue. Transitions each enriched issue to status `enriched`.
---

# Task enrichment

Input: `proposed` `bd` issues that map 1:1 to plan tasks.
Output: same issues, now with rich bodies + labels, transitioned to `enriched`.

## Per-issue procedure

For each `proposed` issue (use `bd list --status proposed --json`):

1. **Re-read the source plan task.**
2. **Pick a team** by matching the affected paths to `.claude/teams/<team>.md` `owned paths:`
   - `apps/web/**` → `frontend-impl-team`
   - `packages/agent/**` → `agent-impl-team`
   - `packages/schemas/**` → `schemas-team`
   - `packages/qa/**` → either `qa-team` (cases) or `frontend-impl-team` (helpers); ask if ambiguous
   - `packages/evals/**` → `evals-team`
   - workflow / `.claude/**` / `docs/**` / CI / scaffolding → `orchestrator`
3. **Pick gates** based on stage type:
   - UI/UX user-facing change → `gate:qa`
   - Agent/prompt/tool change → `gate:evals`
   - All non-trivial code → `gate:review`
4. **Write enriched body**, replacing the original:

   ```
   ## Acceptance criteria
   - [criterion 1]
   - [criterion 2]

   ## Affected files
   - path/to/file.ts (create | modify | delete)

   ## Suggested skills
   - <skill-name>
   - <skill-name>

   ## Plan reference
   docs/plans/<slug>.md — Task <N>
   ```

5. **Apply labels:**

   ```bash
   bd update <id> \
     --label "team:<chosen-team>" \
     --label "gate:review" \
     --label "gate:qa-or-evals-if-applicable" \
     --body "<enriched-body>" \
     --status enriched
   ```

## Stop condition

When `bd list --status proposed` returns empty.

## Guardrails

- Do **not** transition past `enriched`. Orchestrator moves issues to `ready`.
- If acceptance criteria cannot be inferred from the plan task, escalate to the user — do not invent them.
