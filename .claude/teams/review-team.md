# Team: review-team

**Owned paths:** none (reviews branches it does not own)
**Skills:** `superpowers:reviewing-code`

## Handoff in

Triggered when an issue moves to `in_review` with `gate:review`.

## Handoff out

- A review report at `docs/reviews/YYYY-MM-DD-<slug>.md`.
- For each blocking comment, a `bd` issue with `kind:review-action`, `blocks` the parent.
- Transitions parent issue to `closed` only if all action items closed.

## Escalation rules

- Architectural concerns out of scope of the PR → file a separate `bd` issue tagged `kind:chore`, do not block the current review.
