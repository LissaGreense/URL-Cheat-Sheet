# Spec: Agentic Workflow + Repo Skeleton

**Date:** 2026-05-17
**Status:** Approved — ready for planning
**Scope:** Workflow infrastructure and repo scaffolding only. The URL-Cheat-Sheet *app* (URL fetch + chat agent) is out of scope here and will be brainstormed in a separate spec using the workflow this spec establishes.

---

## 1. Goal

Stand up a Bun-workspaces monorepo that ships a native-agentic development workflow end-to-end:

> **brainstorm → plan → plan-review → task-creation → task-enrichment → implementation (subagent teams) → code-review → QA *or* evals → learnings**

Every stage has a canonical skill, a canonical artifact location, and a canonical handoff (usually a `bd` issue transition). The first real feature brainstormed inside this skeleton will be the app itself.

## 2. Non-goals

- Designing the app's data model, persistence, auth, or multi-user story.
- Choosing Supabase (or any DB) — deferred to the app spec.
- Building the chat UI, the URL fetcher, or any agent tools.

## 3. Stack

| Concern | Choice | Pinned version |
|---|---|---|
| Runtime (local + Vercel prod) | Bun, `runtime: 'experimental_bun1.x'` in `adapter-vercel` | `^1.3.14` |
| Language | TypeScript, `strict: true`, `verbatimModuleSyntax: true` | `^6.0.3` |
| Schemas | Zod 4 (note: `error` unified param; `z.strictObject()` not `.strict()`) | `^4.4.3` |
| Web framework | SvelteKit (Svelte 5, runes) | `@sveltejs/kit ^2.60.1`, `svelte ^5.55.7` |
| Vercel adapter | `@sveltejs/adapter-vercel` | `^6.3.3` |
| Bundler | Vite 8 / Rolldown (use `rolldownOptions`, not `rollupOptions`) | `^8.0.13` |
| AI SDK | Vercel AI SDK v6 (run `npx @ai-sdk/codemod v6` on migrations) | `ai ^6.0.184` |
| AI providers | Anthropic primary, OpenAI fallback | `@ai-sdk/anthropic ^3.0.78`, `@ai-sdk/openai ^3.0.64` |
| Svelte AI bindings | `@ai-sdk/svelte` `Chat` class for streaming | `^4.0.184` |
| Tests | Vitest 4 (required for Vite 8), `@testing-library/svelte`, jsdom | `vitest ^4.1.6` |
| Lint / format | ESLint 10 + `eslint-plugin-svelte` + Prettier 3.8 (Biome considered; ESLint chosen for runes-aware Svelte rules) | `eslint ^10.4.0`, `prettier ^3.8.3` |
| Evals | promptfoo (exact pin, still 0.x) | `0.121.11` |
| Task DB | Beads (Dolt-backed); worktree-safe by default via git common-dir discovery | binary `>= v1.0.2` (latest `v1.0.4`) |
| Skills plugin | obra/superpowers, **vendored** into `.claude/plugins/superpowers/` and editable in tree | `v5.1.0` |
| Browser automation (QA) | `claude-in-chrome` MCP | n/a |
| Dependency hygiene | Renovate (better Bun + monorepo support than Dependabot) | n/a |
| Bun lockfile | text-based `bun.lock` (required for Renovate, default since Bun 1.2) | n/a |

**Bun-on-Vercel risk:** explicitly experimental. Fallback to `nodejs24.x` is documented as an ADR escape hatch; code stays Web-standard so the flip is mechanical.

## 4. Repo layout

```
URL-Cheat-Sheet/
├── apps/
│   └── web/                        # SvelteKit, deploys to Vercel
│       ├── src/
│       │   ├── routes/             # pages + +server.ts streaming endpoints
│       │   ├── lib/                # UI components, runes-based state
│       │   └── app.html
│       ├── svelte.config.js        # adapter-vercel, runtime: 'experimental_bun1.x'
│       └── package.json
├── packages/
│   ├── agent/                      # Vercel AI SDK v6 agent + tools
│   ├── schemas/                    # shared Zod 4 schemas
│   ├── evals/                      # promptfoo suites + judge prompts
│   └── qa/                         # reusable QA helpers, fixtures, page-object utils
├── docs/                           # see §5
├── scripts/                        # one-off orchestrators (run-evals, qa-cli, bd helpers)
├── .claude/
│   ├── plugins/superpowers/        # vendored, editable in-tree
│   ├── skills/                     # project-local skills (win by name on collision)
│   ├── teams/                      # team specs
│   ├── commands/                   # slash commands wrapping skill chains
│   └── settings.json
├── .github/workflows/              # ci.yml, qa.yml, release.yml, outdated.yml
├── .beads/                         # Dolt-backed task DB, committed
├── bun.lock                        # text lockfile
├── package.json                    # workspaces: ["apps/*", "packages/*"]
├── tsconfig.base.json              # strict TS, workspace path aliases
├── renovate.json
├── CLAUDE.md                       # repo-wide agent instructions
└── README.md
```

## 5. Docs system — the agent memory

Flat-by-type, dated filenames. Every artifact has one known home, declared in `docs/README.md` (the agent-facing index).

```
docs/
├── README.md                       # what each folder is, when to write/read, naming
├── specs/                          # brainstorming output: YYYY-MM-DD-<slug>.md
├── plans/                          # writing-plans output: YYYY-MM-DD-<slug>.md
├── reviews/                        # reviewing-code output: YYYY-MM-DD-<slug>.md
├── qa/
│   ├── cases/                      # reusable test plans: <feature-slug>.md
│   └── reports/                    # run output: YYYY-MM-DD-<feature-slug>.md
├── evals/                          # promptfoo snapshots: <suite>-YYYY-MM-DD.md
├── learnings/                      # mined by remembering-learnings
└── adr/                            # architectural decisions: NNNN-<slug>.md
```

Every project skill that emits a doc references `docs/README.md` so naming conventions stay in one place.

## 6. Skill system

**Layout:**
```
.claude/
├── plugins/superpowers/            # vendored from obra/superpowers v5.1.0
└── skills/
    ├── svelte-frontend/            # composes with TDD/testing for Svelte 5 + runes
    ├── task-creation/              # plan → bd issues
    ├── task-enrichment/            # bd issue → enriched bd issue
    ├── qa-standard/                # the 4-step QA loop (§8)
    ├── evals-promptfoo/            # write + run promptfoo suites, snapshot results
    ├── beads-recipes/              # canonical `bd` / `bv` queries
    └── using-this-repo/            # session-start orientation
```

**Adaptation strategy:**
- Add project skills that *compose* with upstream rather than replace them. Example: `svelte-frontend` doesn't replace `superpowers:test-driven-development`; it adds Svelte-runes-specific patterns invoked after TDD when frontend files are involved.
- Only vendor-edit an upstream skill if it's actively wrong for our case.
- Project skill `description` fields are the auto-activation trigger — write them as *when to use*, not *what they do*.

## 7. Teams

`.claude/teams/` holds named team specs. A team is: a skill bundle + an owned area of code + a handoff protocol.

```
.claude/teams/
├── frontend-impl-team.md           # owns apps/web. Skills: svelte-frontend, TDD, testing
├── agent-impl-team.md              # owns packages/agent. Skills: TDD, claude-api, testing
├── schemas-team.md                 # owns packages/schemas
├── review-team.md                  # owns code review. Skills: reviewing-code
├── qa-team.md                      # owns qa runs. Skills: qa-standard, agent-browser
├── evals-team.md                   # owns eval suites. Skills: evals-promptfoo
└── orchestrator.md                 # spawns teams from bd issues
```

Each team spec is one page: **owned paths**, **skills to load**, **handoff in** (how it claims work — usually a `bd` label), **handoff out** (artifacts + bd transitions), **escalation rules** (when to ask user vs another team).

**Rule:** only the orchestrator spawns teams. No team spawns another team. Keeps the dependency graph flat.

## 8. Workflow pipeline

| # | Stage | Skill | Input | Output |
|---|-------|-------|-------|--------|
| 1 | Brainstorm | `superpowers:brainstorming` | rough idea | `docs/specs/<date>-<slug>.md` |
| 2 | Plan | `superpowers:writing-plans` | spec | `docs/plans/<date>-<slug>.md` |
| 3 | Plan review | `superpowers:improving-plans` | plan | updated plan + change log |
| 4 | Task creation | `task-creation` (project) | plan | `bd` issues, one per plan step, deps wired |
| 5 | Task enrichment | `task-enrichment` (project) | `bd` issues | acceptance criteria, affected files, suggested team, `team:` label |
| 6 | Implementation | `superpowers:subagent-driven-development` + `.claude/teams/<team>.md` | enriched `bd` issues | commits, tests pass |
| 7 | Code review | `superpowers:reviewing-code` | branch diff | `docs/reviews/<date>-<slug>.md` + bd issues for action items |
| 8a | QA (UI/UX) | `qa-standard` (project) | feature spec | `docs/qa/cases/<feature>.md` + `docs/qa/reports/<date>-<feature>.md` + bd issues for defects |
| 8b | Evals (agent quality) | `evals-promptfoo` (project) | suite spec | `packages/evals/<suite>/` + `docs/evals/<suite>-<date>.md` |
| 9 | Learnings | `superpowers:remembering-learnings` | session commits/reviews | `docs/learnings/<topic>.md` → curated into `CLAUDE.md` |

**8a vs 8b routing:** UI/UX features → QA. Agent quality, prompts, tools, LLM output evaluation → evals. A feature can run both.

## 9. Beads workflow

- `.beads/` (Dolt-backed) committed. Project prefix: `ucs`. `bd` v1.x is worktree-safe by default — no flags needed.
- **Issue lifecycle:** `proposed` (from task-creation) → `enriched` (from task-enrichment) → `ready` (orchestrator-claimable) → `in_progress` → `in_review` → `closed`.
- **Standard labels:**
  - `team:<name>` — routing
  - `kind:{feature,bug,chore,qa-defect,review-action}`
  - `gate:{qa,evals,review}` — which validations must pass before close
- **Dependency rules:**
  - Every implementation issue `blockedBy` its enrichment issue.
  - QA defects `blocks` the parent feature issue — feature cannot close until defects do.
- **Canonical queries** (wrapped in `beads-recipes` skill so commands don't drift):
  - `bv --robot-plan` — parallel-track view for orchestrator
  - `bd ready` — unclaimed work
  - `bv --robot-priority` — what to pick next
- **Worktrees:** every implementation issue gets its own worktree. Orchestrator creates the worktree, spawns the team, merges on close.

## 10. QA standard

Project skill `qa-standard` defines the only sanctioned QA shape:

1. **Plan** — read spec + acceptance criteria, write `docs/qa/cases/<feature>.md` (reusable). Zod schema: `name`, `setup`, `steps[]`, `assertions[]`, `data-dependencies[]`.
2. **Run** — execute via `claude-in-chrome` MCP (`navigate`, `find`, `form_input`, `javascript_tool`, `read_console_messages`, `read_network_requests`). Capture screenshots at every assertion checkpoint.
3. **Report** — write `docs/qa/reports/YYYY-MM-DD-<feature>.md`: `cases-run`, `pass/fail`, `console errors`, `failed network requests`, `screenshots`, `repro per defect`.
4. **File defects** — each fail → `bd` issue: `kind:qa-defect`, `blocks:<parent>`, body links the report section.

Loop ends when all cases pass OR all defects are filed. **The QA agent does not fix issues** — that's an explicit guardrail. Implementation team fixes in a subsequent loop.

## 11. Evals standard

Project skill `evals-promptfoo` uses promptfoo as the runner:

- Suites at `packages/evals/suites/<suite>/promptfooconfig.yaml`. Test data in adjacent `.jsonl`.
- Judge prompts under `packages/evals/judges/`. Zod-validated config.
- `bun run eval <suite>` wraps `promptfoo eval` and writes `docs/evals/<suite>-YYYY-MM-DD.md`: top-level pass rate, regressions vs previous snapshot, per-case scores.
- **When triggered:** auto in CI on PRs touching `packages/agent/**` or `packages/evals/**`; on-demand for any `bd` issue with `gate:evals`.

## 12. CI/CD

GitHub Actions workflows in `.github/workflows/`:

| Workflow | Triggers | Jobs |
|---|---|---|
| `ci.yml` | every PR, push to `main` | `install` (cached Bun) → parallel: `typecheck`, `lint`, `test`, `build`, `eval-gate` (conditional on agent paths) |
| `qa.yml` | manual dispatch + bd issue with `gate:qa` | spins up preview deploy, runs `qa-standard` against it, posts report comment |
| `release.yml` | push to `main` after CI green | Vercel production deploy via Git integration |
| `outdated.yml` | weekly cron | `bun outdated`; opens a `bd` chore issue if drift detected |

**Concrete commands** (Bun workspaces, run from repo root):
- `bun run typecheck` → `tsc -b` across workspaces, strict, no errors
- `bun run test` → `vitest run` (jsdom + `@testing-library/svelte`)
- `bun run lint` → ESLint 10 + `eslint-plugin-svelte` + Prettier 3.8
- `bun run build` → `bun --filter '*' build`
- `bun run eval` → wrapper around `promptfoo eval`

**Branch protection on `main`:**
- `typecheck` ✓
- `lint` ✓
- `test` ✓
- `build` ✓
- `eval-gate` (matrix-conditional — required only when agent paths touched)
- `qa.yml` posts a comment but is not a required check (manual gate for UI features)

**Dependency hygiene — Renovate** (not Dependabot, per audit):
- `renovate.json` at root.
- Grouped majors: AI SDK group, Svelte stack group, dev-tools group.
- Auto-merge patch + dev-only minors after CI green.
- Bun lockfile is text `bun.lock` so Renovate works natively.
- Weekly `bun outdated` cron as a safety net if Renovate misses.

**GitHub Actions Bun setup:** `oven-sh/setup-bun@v2` pinned to `v2.2.0`. Reads `engines.bun` from `package.json` by default.

## 13. ADRs to author at scaffold time

- `0001-bun-on-vercel.md` — why we accept the experimental runtime + fallback procedure to `nodejs24.x`.
- `0002-eslint-over-biome.md` — why ESLint 10 + `eslint-plugin-svelte` over Biome 2 for this project.
- `0003-renovate-over-dependabot.md` — why Renovate handles our Bun monorepo better.
- `0004-vendored-superpowers.md` — why we vendor obra/superpowers instead of installing as plugin.

## 14. Deferred / open

| Item | When to revisit |
|---|---|
| Supabase or any persistence | When app is brainstormed |
| Auth | When app is brainstormed |
| Conversation history / multi-user | When app is brainstormed |
| Node-runtime fallback execution | Only if `experimental_bun1.x` misbehaves in prod |
| TypeScript 7 migration (Go-based, breaking) | When TS 7 ships stable |
| Biome migration | Reconsider when Biome's Svelte coverage matches ESLint's |

## 15. Success criteria

The skeleton is "done" when:

1. A new feature can be taken from `superpowers:brainstorming` to merged-and-validated through the full pipeline (§8) without leaving the repo or inventing ad-hoc conventions.
2. Every artifact emitted has exactly one canonical location per `docs/README.md`.
3. CI gates (typecheck, lint, test, build, conditional eval) all run green on a trivial change.
4. A `bd` issue can be created, enriched, claimed by a team, completed, reviewed, and closed without orchestrator-side scripting beyond what the project skills define.
5. The app spec can be brainstormed *using this workflow* without any workflow-side changes.
