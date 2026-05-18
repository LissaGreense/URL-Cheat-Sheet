---
name: qa-standard
description: Use to run end-to-end QA against the deployed (or locally previewed) URL-Cheat-Sheet app. Required for any `bd` issue labeled `gate:qa`. Strict 4-step loop — the QA agent never fixes defects, it only files them.
---

# QA standard

The only sanctioned QA shape in this repo. Use the `claude-in-chrome` MCP for
browser interaction.

## 1. Plan

If a reusable case for this feature exists at `docs/qa/cases/<feature>.md`,
use it. Otherwise create one. The case file is YAML conforming to
`packages/schemas/src/qa-case.ts` (`qaCaseSchema`):

```yaml
name: <feature-slug>
setup:
  - "set env X=Y"
steps:
  - { action: navigate, target: "/" }
  - { action: click, target: "[data-testid=start]" }
  - { action: type, target: "input[name=url]", value: "https://example.com" }
assertions:
  - "chat panel renders within 2s"
  - "no console errors"
dataDependencies: []
```

Save as `docs/qa/cases/<feature>.md` (front-matter + the YAML in a fenced block).

## 2. Run

Invoke the case via `claude-in-chrome` tools, in order:

1. `tabs_create_mcp` → open the preview URL
2. For each step: `navigate` / `find` + `form_input` / `javascript_tool`
3. After each step: `read_console_messages` (look for errors), `read_network_requests` (look for non-2xx)
4. At each assertion checkpoint: take a screenshot via `gif_creator` or `upload_image`

## 3. Report

Write `docs/qa/reports/YYYY-MM-DD-<feature>.md`:

```markdown
# QA Report — <feature> — <date>

**Case:** ../cases/<feature>.md
**Preview URL:** <url>
**Run by:** <agent or human>

## Results
| # | Assertion | Pass/Fail |
|---|---|---|
| 1 | <assertion> | ✅ |
| 2 | <assertion> | ❌ |

## Console errors
- `<line>` (page <route>)

## Failed network requests
- `<method> <url>` → `<status>`

## Screenshots
- step-1: <path>
- step-2: <path>

## Defects filed
- bd-<id> — <one-line summary>
```

## 4. File defects

For each failed assertion, create a `bd` issue:

```bash
bd create \
  --title "QA defect: <one-line>" \
  --kind qa-defect \
  --label "gate:review" \
  --body "Report: docs/qa/reports/YYYY-MM-DD-<feature>.md#<anchor>\nRepro: <steps>"

bd dep add --blocker <defect-id> --blocked <parent-feature-id>
```

## Stop conditions

Loop ends when **either** all assertions pass **or** all failures have a filed defect. Never both partially done.

## Guardrails

- **Do not fix defects.** That belongs to the implementation team in a subsequent loop.
- **Do not trigger JS `alert`/`confirm` dialogs** — they freeze the chrome MCP session.
- If chrome MCP fails 2-3 times, stop and ask the user.
