# Docs — Agent Index

This directory is the single source of truth for design, planning, review,
and validation artifacts. Every project skill that emits a document writes
to one of the folders below using the naming convention given. Do not
invent new folders without an ADR.

| Folder | What goes here | Naming | Written by |
|---|---|---|---|
| `specs/` | Brainstorming output | `YYYY-MM-DD-<slug>.md` | `superpowers:brainstorming` |
| `plans/` | Implementation plans | `YYYY-MM-DD-<slug>.md` | `superpowers:writing-plans` |
| `reviews/` | Code review reports | `YYYY-MM-DD-<slug>.md` | `superpowers:reviewing-code` |
| `qa/cases/` | Reusable QA test plans | `<feature-slug>.md` | `qa-standard` (project) |
| `qa/reports/` | QA run output | `YYYY-MM-DD-<feature-slug>.md` | `qa-standard` (project) |
| `evals/` | Eval suite snapshots | `<suite>-YYYY-MM-DD.md` | `evals-promptfoo` (project) |
| `learnings/` | Mined session learnings | `<topic>.md` | `superpowers:remembering-learnings` |
| `adr/` | Architectural decision records | `NNNN-<slug>.md` (sequential) | any author |

## Naming rules

- **Date prefix** for any time-bounded artifact (specs, plans, reviews, QA reports, eval snapshots).
- **Slug** is lowercase kebab-case, no dots, no underscores.
- **ADRs** use a zero-padded sequential number (`0001-…`, `0002-…`).
- **QA cases** are reusable across runs, so no date prefix — the run goes in `reports/`.

## Cross-references

When one artifact references another, link by relative path so renames break loudly:
`../specs/2026-05-17-foo.md`, not `docs/specs/2026-05-17-foo.md` and not `[foo](foo)`.
