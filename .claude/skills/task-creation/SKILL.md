---
name: task-creation
description: Use immediately after `superpowers:writing-plans` (or its review) produces an approved plan in `docs/plans/`. Converts each plan task into a `bd` issue with status `proposed`, with dependency edges matching the plan's task order.
---

# Task creation

Input: an approved plan at `docs/plans/YYYY-MM-DD-<slug>.md`.
Output: one `bd` issue per plan task, in status `proposed`, with deps wired.

## Procedure

1. **Read the plan.** Identify each `### Task N: <name>` heading.
2. **Create one bd issue per task** (in order, so IDs follow plan order):

   ```bash
   bd create \
     --title "<plan-task-title>" \
     --kind feature \
     --status proposed \
     --body "Plan: docs/plans/<slug>.md\nTask: <N>"
   ```

3. **Wire dependencies.** If Task N+1 depends on Task N (default), add an edge:

   ```bash
   bd dep add --blocker <id-of-N> --blocked <id-of-N+1>
   ```

4. **Do not enrich.** Acceptance criteria, team labels, and affected files
   are added in the `task-enrichment` stage. Leave them empty here.

5. **Report.** Output the list of created issue IDs (lowest → highest) and a
   one-line summary of dependency edges.

## Guardrails

- Do **not** assign owners.
- Do **not** transition to `enriched` or `ready`.
- Do **not** start implementation.
