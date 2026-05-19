# ADR 0006: Drop dead `enriched`/`ready` custom bd statuses

**Status:** accepted
**Date:** 2026-05-19
**bd issue:** ucs-4qh

## Context

Per ADR 0005 the project uses a multi-stage agentic pipeline:
`proposed` → enrichment → claimable → `in_progress` → `in_review` → `closed`.
The original implementation modelled the middle stages with four custom
bd statuses, provisioned by `scripts/setup-bd.sh`:

| Status      | Active/wip | Intended role                                   |
|-------------|------------|-------------------------------------------------|
| `proposed`  | active     | Created from a plan, not yet enriched           |
| `enriched`  | active     | Acceptance criteria + `team:`/`gate:` labels added |
| `ready`     | active     | Orchestrator confirmed dependencies wired        |
| `in_review` | wip        | PR open, gates clearing                          |

In the URL-fetcher run on 2026-05-19 the orchestrator entrypoint
(`/claim-next`) returned `[]` despite ten enriched issues being parked
at `enriched`/`ready`. The root cause is structural, not configuration:

1. `bd ready` (the built-in query) filters to **built-in active statuses
   only** — i.e. `open`. Custom active statuses are invisible to it.
2. `bv --robot-priority` reads the same view and likewise returns no
   recommendations for issues outside built-in `open`.
3. `ready` was provisioned but **no skill ever transitioned an issue
   into it** (`scripts/setup-bd.sh` even documented this: "reserved for
   orchestrator handoff (not currently used by skills)").

The custom statuses therefore created the appearance of pipeline state
that the tooling couldn't see, which broke the orchestrator's
"pick-the-top-priority-ready-issue" automation and forced every
implementation cycle to hand-pick work from `bd list --status=enriched`.

## Decision

Drop the `enriched` and `ready` custom statuses. The post-enrichment,
pre-claim state of an issue is now plain `open` — the canonical
claimable state already understood by `bd ready` and `bv --robot-priority`.

Updated status model:

| Status        | Source      | Role                                                          |
|---------------|-------------|---------------------------------------------------------------|
| `proposed`    | **custom**  | Created from a plan, not yet enriched (deliberately hidden from `bd ready`) |
| `open`        | built-in    | Enriched and claimable — has `team:` and `gate:*` labels       |
| `in_progress` | built-in    | `pr-open` action ran (worktree + draft PR exist)               |
| `in_review`   | **custom**  | PR ready, gates clearing                                       |
| `closed`      | built-in    | All gates passed, PR merged                                    |

The enrichment signal moves from status (was `status=enriched`) to
**labels** (`team:<name>` + at least one `gate:*`). Labels were already
the required enrichment artifact; the custom status duplicated the
information without adding a query path the tooling understood.

`bd ready` now sees every claimable issue; `bv --robot-priority` works
without `--robot-by-label` flags.

## Consequences

- **Positive:** Orchestrator entrypoint (`/claim-next`, `pipeline-status`)
  works without manual workarounds. `bv --robot-priority` returns
  meaningful recommendations again.
- **Positive:** Smaller custom-status surface area — only two custom
  statuses remain (`proposed`, `in_review`), each load-bearing.
- **Negative:** Two states (un-claimable but enriched? vs. un-claimable
  because un-enriched?) are no longer distinguishable by status alone —
  callers must inspect labels. In practice the only consumer that cares
  is `task-enrichment`, which already iterates by `--status proposed`.
- **Migration:** No data migration needed — at the time of the change,
  zero open issues were in `enriched`/`ready` (the prior workaround
  closed/reverted them back to `open`). The dropped statuses are removed
  from `scripts/setup-bd.sh`; running the script in an existing clone
  shrinks the custom-status set on next invocation.

## Alternatives considered

- **Rewrite skills to query custom statuses explicitly** (Option 3 from
  ucs-4qh): would patch `claim-next` and `pipeline-status` to call
  `bd list --status=enriched --json | jq` instead of `bd ready`. Rejected
  because it perpetuates the disconnect, gives up on `bv --robot-priority`
  entirely (also `open`-only), and adds jq plumbing for what is already
  expressible as built-in semantics.
- **Teach `bd` to treat `ready` as `open`-equivalent**: no such config
  knob exists upstream. Would require a patch to `bd` itself. Out of
  scope.
- **Keep `enriched` as a custom status, drop only `ready`**: half-measure.
  `enriched` is still invisible to `bd ready`, so the orchestrator
  remains broken. The label-based enrichment signal works without it.

## References

- bd issue: ucs-4qh
- Prior model: `docs/specs/2026-05-17-agentic-workflow-skeleton.md` §8
  (no longer authoritative — `.claude/skills/using-this-repo/SKILL.md`
  has the canonical 13-stage table; this ADR updates the status
  vocabulary).
- ADR 0005 — branch-first and the PR lifecycle that frames the
  `in_review` → `closed` transition.
