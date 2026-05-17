---
name: evals-promptfoo
description: Use to author or run an evaluation suite for any agent-quality concern (prompts, tools, judgment quality). Required for any `bd` issue labeled `gate:evals`. Uses promptfoo as the runner and snapshots results into `docs/evals/`.
---

# Evals (promptfoo)

For agent-quality features only. UI/UX → `qa-standard`.

## Authoring a new suite

1. Create the suite directory:

   ```
   packages/evals/suites/<suite-name>/
     promptfooconfig.yaml
     cases.jsonl
   ```

2. **`promptfooconfig.yaml` shape:**

   ```yaml
   description: <what this suite measures>
   prompts:
     - file://prompts/<prompt-name>.md
   providers:
     - id: anthropic:claude-sonnet-4-6
   tests: file://cases.jsonl
   defaultTest:
     assert:
       - type: llm-rubric
         provider: anthropic:claude-sonnet-4-6
         value: <rubric in plain text>
   ```

3. **`cases.jsonl` shape** — one JSON object per line:

   ```jsonl
   {"vars": {"input": "..."}, "assert": [{"type": "contains", "value": "..."}]}
   ```

4. **Judge prompts** (LLM-as-judge) live at `packages/evals/judges/<name>.md`,
   validated by a Zod schema in `packages/schemas/`.

## Running

```bash
bun run eval <suite-name>
```

This wraps `promptfoo eval` and writes a snapshot to
`docs/evals/<suite-name>-YYYY-MM-DD.md`.

## When to run

- **Automatic in CI** when a PR touches `packages/agent/**` or `packages/evals/**`.
- **On-demand** for any `bd` issue with `gate:evals`.

## Snapshot interpretation

- Top-level pass rate < 95% on a suite that previously passed 100% → regression. File a `bd` issue with `kind:bug` and `gate:evals` blocking the parent.
- New failures on never-before-seen cases → triage: is the case wrong, or the agent wrong?

## Guardrails

- Do **not** add cases that depend on external network state that could flake.
- Do **not** commit secrets in `cases.jsonl` — use env interpolation.
- Snapshot files are committed; they're the regression baseline.
