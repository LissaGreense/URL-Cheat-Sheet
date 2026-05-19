# Spec: broader grounding eval matrix

> **Post-impl corrigendum (2026-05-20, ucs-zvf):** The "Suite shape" section
> below shows `id: file:../../src/providers/agent-provider.ts`. This single-
> slash form does NOT work — promptfoo's loader only strips `file://` (two
> slashes). The actual implementation ships `file://../../...` (two slashes,
> relative to the config file directory). The `${REPO_ROOT}` env-var
> interpolation discussed in the companion plan also does not work in
> promptfoo 0.121.11. Future specs/plans should specify
> `file://<relative-or-absolute-path>` for promptfoo file refs.

**Date:** 2026-05-19
**Status:** Draft — pending review
**Followup of:** `docs/plans/2026-05-19-url-fetcher.v2.md` § "Follow-up `bd` issues"
**Related:** `docs/specs/2026-05-19-url-fetcher.md` § "Layer 3 — Eval coverage"

## Problem

The `url-grounding` promptfoo suite scaffolded in ucs-92p does not exercise
the chat agent. The runner shells `promptfoo eval`, which calls the Anthropic
provider directly using an inline prompt template. The `kb_url` variable is
merely interpolated as text — there is no real fetch, extract, or grep. The
existing `L\d+` citation assertion only passes when the model fabricates a
plausible-looking line reference, which is exactly the failure mode the real
agent prevents.

This is documented as a known limitation in
`packages/evals/suites/url-grounding/promptfooconfig.yaml` (header comment)
and called out as a deferred `gate:evals` follow-up in the url-fetcher v2
plan.

## Goal

Make the `url-grounding` suite measure what it claims to measure:

1. **Plumb `kb_url` through the actual chat agent** via a custom promptfoo
   provider that calls `streamChat(messages, document)` directly.
2. **Broaden the matrix** from 2 RFC-2324 questions to ~6–8 questions across
   ~4 documents of varied structure (RFCs + Wikipedia).
3. **Replace the brittle `L\d+` regex** with a layered judge: cheap regex for
   citation presence + LLM rubric for substantive grounding.

## Non-goals

- CI integration. This suite stays on-demand (`bun packages/evals/src/run.ts
  url-grounding`), matching the project's current "canary in CI, real suites
  local" pattern.
- Layer 3 injection-resilience eval suite. That's the sibling follow-up,
  uses the same provider, but lives in its own suite.
- Citation-verifier judge (re-grepping the doc at cited line numbers). The
  LLM rubric covers groundedness for v1; a deterministic citation verifier
  is a follow-up if rubric variance proves problematic.
- HTTP path (running a dev server and POSTing to `/api/chat`). In-process
  direct import of `streamChat` is faster, cheaper, and exercises the same
  agent code path.

## Design

### Architecture

```
packages/evals/
├── src/
│   ├── run.ts                          # unchanged
│   └── providers/
│       ├── agent-provider.ts           # NEW — custom promptfoo provider
│       └── agent-provider.test.ts      # NEW — unit test
└── suites/
    └── url-grounding/
        └── promptfooconfig.yaml        # updated: uses provider + matrix
```

### Provider contract

`packages/evals/src/providers/agent-provider.ts` exports a default class
implementing promptfoo's custom-provider interface:

```ts
class AgentProvider {
  id(): string;
  callApi(
    prompt: string,
    context: { vars: { kb_url: string; question: string } }
  ): Promise<{ output: string } | { error: string }>;
}
```

`id()` returns the literal string `"url-cheat-sheet:agent"`.

Inside `callApi`:

1. Read `kb_url` and `question` from `context.vars`. If either is missing,
   return `{ error: "missing kb_url or question in vars" }`.
2. `await extractContent(kb_url)`. On `ExtractError`, return
   `{ error: <human-readable extract failure> }` — promptfoo will mark the
   test as errored (distinct from failed-graded), which is the right
   signal: the test couldn't run, so grading the answer would be lying.
3. Build `messages: UIMessage[]` with a single user message:
   `[{ role: 'user', parts: [{ type: 'text', text: question }] }]`.
4. `await streamChat(messages, document)` where `document` is the
   `extractContent` result shaped as the `Document` type
   (`{ url, text }`).
5. Drain the streaming `Response`. The body is the AI SDK v6 data-stream
   format; concatenate the assistant text deltas into a single string.
6. Return `{ output: text }`.

The `prompt` parameter is ignored — the provider builds the message array
from `vars` directly. The YAML `prompts:` field becomes a one-line
placeholder satisfying promptfoo's required field.

ANTHROPIC_API_KEY is required (read by `streamChat` via the underlying
Anthropic SDK). If absent, `streamChat` fails loudly with the SDK's
standard error. Per project rule (CLAUDE.md "Hard rules"), `.env` is
user-managed; this spec does not introduce env-handling code.

### Suite shape

`packages/evals/suites/url-grounding/promptfooconfig.yaml`:

```yaml
description: URL-grounded chat — broader grounding matrix
providers:
  - id: file:../../src/providers/agent-provider.ts
prompts:
  - "{{question}}"
defaultTest:
  assert:
    - type: regex
      value: 'L\d+'
    - type: llm-rubric
      value: |
        The answer addresses the question and cites at least one Lxx line
        reference. The cited line should plausibly support the claim. The
        answer should not contain facts that aren't in the document.
  options:
    provider: anthropic:messages:claude-haiku-4-5
tests:
  # — RFC 2324 (HTCPCP) —
  - description: HTCPCP expansion grounded in RFC 2324
    vars:
      kb_url: https://www.rfc-editor.org/rfc/rfc2324.html
      question: What does HTCPCP stand for?
    assert:
      - type: contains
        value: Hyper Text Coffee Pot Control Protocol
  - description: 418 status code lookup
    vars:
      kb_url: https://www.rfc-editor.org/rfc/rfc2324.html
      question: What HTTP status code does RFC 2324 reserve for teapots?
    assert:
      - type: contains
        value: '418'

  # — RFC 7168 (HTCPCP-TEA extension) —
  - description: HTCPCP-TEA varieties
    vars:
      kb_url: https://www.rfc-editor.org/rfc/rfc7168.html
      question: Which tea varieties does the HTCPCP-TEA extension define?

  # — Wikipedia: HTCPCP —
  - description: HTCPCP Wikipedia summary
    vars:
      kb_url: https://en.wikipedia.org/wiki/Hyper_Text_Coffee_Pot_Control_Protocol
      question: When was HTCPCP first published?

  # — Wikipedia: HTTP 418 (stable, sibling topic) —
  - description: HTTP 418 origin per Wikipedia
    vars:
      kb_url: https://en.wikipedia.org/wiki/HTTP_418
      question: Which RFC originally defined HTTP status 418?
    assert:
      - type: contains
        value: '2324'
```

Seed count: 4 documents, 5 tests at the spec stage. The matrix is
data-driven — adding a test is appending a YAML entry. We expect to add
2–3 more during impl after empirical signal on which doc types cause the
extractor or grep tool to struggle.

Doc selection criterion for any additions: stable, low-edit-volume,
line-numberable prose, renders without JS (works under linkedom +
Readability).

### Judge

`claude-haiku-4-5` for the LLM rubric, set via `defaultTest.options.provider`.
Roughly 10× cheaper than sonnet for grading calls. If rubric variance
proves problematic in practice, swap to sonnet on the rubric line only —
trivial single-line change.

### Per-test assertions

`defaultTest.assert` applies to every test (regex + rubric). Per-test
`assert:` entries are additive and used only for keyword anchors where the
answer must contain a specific token ("418", "HTCPCP" expansion). Most
tests will have no per-test assertions and rely entirely on the rubric.

### Testing

1. **Provider unit test** (`agent-provider.test.ts`) — mocked
   `extractContent` and `streamChat`. Verifies:
   - Missing `kb_url` or `question` → `{ error: ... }`
   - `ExtractError` from `extractContent` → `{ error: ... }`
   - Streaming body is correctly drained to text
   - `streamChat` is called with the expected `UIMessage[]` shape
   - The successful path returns `{ output: <joined text> }`

   Fast, deterministic, no API key needed.

2. **Live run during impl** — once locally with a real `ANTHROPIC_API_KEY`:
   `bun packages/evals/src/run.ts url-grounding`. Confirms end-to-end:
   provider loads, real fetches succeed, grading runs, snapshot writes to
   `docs/evals/url-grounding-2026-05-19.md`. Not a recurring test; this is
   the impl-time verification before the PR is marked ready.

### Risks

- **External page drift** — Wikipedia and RFC URLs can change.
  Mitigations: rubric tolerates minor wording shifts; `contains` only used
  on stable facts ("418", "Hyper Text Coffee Pot Control Protocol"); doc
  selection prefers low-edit-volume targets.
- **Judge variance** — `claude-haiku-4-5` is cheap but graders drift.
  Mitigation: single-line swap to sonnet on the rubric provider if real
  runs show flake.
- **Streaming body shape** — AI SDK v6 data-stream format must be parsed
  to extract assistant text deltas. The plan should pin the exact decoder
  approach against the installed `ai` package version (per ucs-mmj — do
  not paste verbatim parser code from training data).

## Acceptance criteria

1. `packages/evals/src/providers/agent-provider.ts` exists and implements
   the contract above.
2. `agent-provider.test.ts` passes via `bun test` with the five cases
   listed under "Testing → Provider unit test".
3. `suites/url-grounding/promptfooconfig.yaml` uses the custom provider,
   the data-driven matrix, the layered judge (regex + rubric), and the
   haiku grader.
4. The header comment in the YAML is updated to reflect that the suite
   now exercises the agent (or removed if the new comment fits in a
   single line of `description:`).
5. A live local run produces a snapshot at
   `docs/evals/url-grounding-<date>.md`. The snapshot is well-formed
   (valid promptfoo JSON) and contains per-test grading output for every
   test in the matrix. Full pass is not required — this is a measurement
   suite, not a CI gate.

## Out of scope (restated)

- CI integration / `gate:evals` automation.
- Layer 3 injection-resilience suite.
- Citation-verifier (re-grep) judge.
- HTTP path through `/api/chat`.
- Multi-doc KB or persistent KB.

## Follow-ups carved at task-creation, not in this spec

- Injection-resilience suite (Layer 3), separate from this work.
- Promote this suite to a CI gate if/when grounding becomes regression-
  prone enough to justify the recurring API spend.
- Citation-verifier judge if rubric variance proves problematic.
