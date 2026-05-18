---
description: Print a snapshot of the agentic pipeline — current bd ready queue, in-progress issues, and any blocking gates.
---

Run these commands in order and summarize the output for the user:

1. `bd ready` — what's claimable
2. `bd list --status in_progress` — what's being worked on
3. `bd list --status in_review` — what's pending review/qa/evals
4. `bv --robot-priority` — recommended next pick

End with: "Top recommended pick: <id> — <title> (reason: <why>)".
