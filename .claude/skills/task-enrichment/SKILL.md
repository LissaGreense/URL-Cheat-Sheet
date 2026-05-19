---
name: task-enrichment
description: Use after `task-creation` has populated `bd` with `proposed` issues. Walks the plan and adds acceptance criteria, affected files, a `team:` label, and any `gate:` labels per issue. Transitions each enriched issue to status `open` (the canonical claimable state — see ADR 0006).
---

# Task enrichment

Input: `proposed` `bd` issues that map 1:1 to plan tasks.
Output: same issues, now with rich bodies + labels, transitioned to `open` so
that `bd ready` and `bv --robot-priority` can see them. The `team:` and `gate:`
labels added in this stage are themselves the signal that enrichment is complete —
no extra custom status is needed (ADR 0006).

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
     --status open
   ```

## Stop condition

When `bd list --status proposed` returns empty.

## Guardrails

- Transition to `open`, not `in_progress`. The orchestrator's `pr-open` action
  is what flips an issue to `in_progress` (it does that when the draft PR is created).
- If acceptance criteria cannot be inferred from the plan task, escalate to the user — do not invent them.
