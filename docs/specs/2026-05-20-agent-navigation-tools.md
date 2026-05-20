# Spec: agent navigation tools — `outline()` + `read_lines()`

**Date:** 2026-05-20
**Status:** Draft — pending review
**Closes:** `ucs-tke`
**Followup of:** `docs/specs/2026-05-20-agent-hardening-sweep.md`
**Snapshot that motivated it:** `docs/evals/grounding-judge-calibration-2026-05-20.md` (rows 6, 10)

## Problem

The agent fabricates content when `grep_doc` returns no matches on an
off-topic question. From the 2026-05-20 calibration set:

- **Row 6** — asked about encryption in RFC 2324 (HTCPCP). No encryption
  in the doc. Agent invented "AES-256, GCM mode, ChaCha20-Poly1305,
  HMAC-SHA256."
- **Row 10** — asked about Japanese tea varieties in RFC 7168
  (HTCPCP-TEA). No Japanese varieties in the doc. Agent invented
  "matcha, sencha, hojicha" with non-existent line citations.

The system prompt already instructs refusal — "`I couldn't find this
in the document' is a valid answer" — and the agent fabricates anyway.
This means the fix is **not** another prompt-tweak. The agent has no
authoritative way to confirm "this topic is not in this document":
`grep_doc` returning empty is suggestive but not conclusive, because
the agent could simply be picking the wrong keywords. Without a tool
that exposes document structure, the path of least resistance is
plausible-sounding fabrication.

## Goal

Give the agent two new tools — `outline()` and `read_lines(start, end)` —
so it can navigate the document, not just search it. Compose with the
existing `grep_doc` to form a deterministic fallback ladder ending in
honest refusal:

```
grep_doc(pattern)      → if matches, finalize with citations
  └ (0 matches)        → outline()
      └               → read_lines(N..M) on a section the outline suggests
          └ (still no relevant content) → finalize("Not in document. Doc covers: <outline summary>")
```

## Non-goals

- Extending `grep_doc` with `regex` or `context_lines` flags. The
  documented failure is "agent doesn't know what to grep," not "agent's
  grep is too rigid." Speculative; deferred.
- Anthropic Citations API migration. Already on the roadmap as a Tier 3
  architectural item.
- Multi-grep batch, citation-verifier, retrieval-planning step,
  structured-output schema, top-K reranking on saturated grep. All
  documented in `docs/agent-hardening-roadmap.md`; untouched here.
- Semantic / hybrid search. Not motivated by the documented failure —
  research (arXiv 2605.15184) shows inline grep wins single-doc Q&A
  across every harness/model pair tested.
- Replacing the `Lxx` line-citation format. Line numbers must remain
  byte-stable across the extraction change (see Design §3).
- Eval-suite expansion beyond the 2 trap cases that anchor this change.

## Design

### 1. New tool: `outline()`

**File:** `packages/agent/src/tools/outline.ts`

```ts
outline()  →  Array<{ text: string; level: 1|2|3|4|5|6; line: number }>
```

- Closure over the loaded `Document` (same pattern as `grep_doc`).
- Returns the heading list with 1-based line numbers pointing into the
  same line numbering `grep_doc` and `Lxx` citations use.
- Empty array when Readability produced no headings (some pages strip
  them all during cleaning). Empty is a valid, non-error result — the
  agent learns the doc has no detectable structure and falls back to
  grep + read_lines.
- Tool description teaches the agent: call once at the start of any
  question to learn what the document covers; after a `grep_doc` zero-
  hit, call `outline()` then `read_lines()` on the closest section
  before refusing.

### 2. New tool: `read_lines(start, end)`

**File:** `packages/agent/src/tools/read-lines.ts`

```ts
read_lines(start: number, end: number)
  →  { text: string; truncated: boolean }
```

- Closure over the loaded `Document`.
- `start` and `end` are 1-based, inclusive, clamped to `[1, lineCount]`.
- Hard cap: `end - start + 1 ≤ 200`. When the request exceeds the cap,
  return the first 200 lines from `start` and set `truncated: true`.
- Output format: each line prefixed `Lxx | ` so the agent can cite
  directly from the read result without bookkeeping. Example:

  ```
  L142 | The Brew-Coffee method instructs a coffee pot
  L143 | to brew coffee.
  ```

- Returns `{ text: '', truncated: false }` for an out-of-range or
  empty range. No error variant — empty text is the natural signal.

### 3. Extension to extraction (`extract.ts`)

**Hard requirement:** `article.textContent` output must NOT change
byte-for-byte. Line numbering is load-bearing for every existing `Lxx`
citation, every eval expectation, and every grep-doc test fixture.
Drift here invalidates the entire eval baseline.

**Approach:** keep `article.textContent` as the source of truth for
`text`. Run a **sidecar pass** to attach heading line numbers without
touching `text`:

```ts
// extract.ts (sketch)
const article = new Readability(document as unknown as Document).parse();
if (!article || !article.textContent) return { kind: 'EMPTY_EXTRACTION' };

const text = article.textContent.trim();
if (text.length < MIN_VIABLE_EXTRACTION) return { kind: 'EMPTY_EXTRACTION' };

const headings = extractHeadings(article.content ?? '', text);

return { text, title: (article.title ?? '').trim(), headings };
```

`extractHeadings(contentHtml, textContent)`:

1. Parse `contentHtml` with `linkedom` (already a dep).
2. `querySelectorAll('h1, h2, h3, h4, h5, h6')` in document order.
3. For each heading, normalize its text: collapse runs of whitespace
   to a single space, trim, then lowercase.
4. Walk `textContent` line-by-line from a cursor (initialised at 0,
   advances after each match). For each heading, find the first line
   at or after the cursor whose same-normalized content includes the
   normalized heading text. Record `{ text, level, line: i+1 }`
   (store the heading's original, un-normalized text) and advance the
   cursor.
5. Headings that can't be located (e.g. Readability mangled them) are
   skipped — they don't fail the extraction.

Return shape — extension only, no breaking change:

```ts
export type ExtractResult = {
  text: string;
  title: string;
  headings: Array<{ text: string; level: 1|2|3|4|5|6; line: number }>;
};
```

### 4. Schemas

`packages/schemas` — `Document` gains a `headings` field. `Heading`
type defined inline beside `Document` (no separate barrel export — the
type has one consumer right now). Migration: every `Document` literal
in tests adds `headings: []`. The deterministic test step in §6
enumerates these.

### 5. Agent wiring

`packages/agent/src/agent.ts` registers the two new tools. `stopWhen`
remains `[stepCountIs(10), hasToolCall('finalize')]` — no change. The
step budget already comfortably accommodates one outline + one
read_lines on top of the existing grep budget.

### 6. System prompt update

`packages/agent/src/prompt.ts` — append one paragraph to the existing
prompt. Do not rewrite the existing rules:

> Two more tools are available. `outline()` returns the document's
> heading structure with line numbers — call it when you need to know
> what the document covers (always reasonable at the start of a
> question). `read_lines(start, end)` returns up to 200 lines of raw
> text with `Lxx` prefixes — use it after a grep hit to read
> surrounding context, or after `outline()` to read a section.
>
> If `grep_doc` returns no matches AND `outline()` shows no relevant
> section AND `read_lines()` on the likely section confirms the topic
> isn't covered, the correct answer is: "The document does not cover
> [topic]. It covers [brief summary from outline]." Do not fabricate
> content to fill the gap.

The existing "I couldn't find this in the document" language stays.
The new paragraph strengthens it by giving the agent a concrete
ladder to climb before refusing.

### 7. Eval coverage

Two new cases under `packages/evals/suites/url-grounding/`:

| Case | Doc | Question | Expected |
|---|---|---|---|
| `trap_encryption` | RFC 2324 (HTCPCP) | "What encryption algorithms does HTCPCP use?" | Refusal that names what HTCPCP actually covers (HTTP methods for coffee pots, status codes). |
| `trap_japanese_tea` | RFC 7168 (HTCPCP-TEA) | "What Japanese tea varieties does this protocol define?" | Refusal that names what RFC 7168 actually covers (tea brewing extensions). |

Judge prompt unchanged. Each trap case is a passing eval iff the
judge grades the response as a grounded refusal — i.e. the agent
explicitly says the topic is not covered, and the "what it IS about"
content the agent provides is grounded in the document with citations.

### 8. Success criteria (verifiable)

The umbrella `ucs-tke` is done when:

1. `bun test` adds new unit tests for `outline`, `read_lines`, and the
   heading sidecar in `extract.ts`. All pass.
2. The full `bun test` suite stays green (no regression in existing
   tests).
3. Both trap cases FAIL on `main` before merge. Captured in the PR
   body as a snapshot.
4. Both trap cases PASS after the toolset + prompt update merge.
5. The existing 5 `url-grounding` suite cases stay 5/5.
6. Re-run the 10-row gold-set calibration. Cohen's κ within ±0.05 of
   the 0.80 baseline (so ≥ 0.75, ≤ 0.85).
7. No line-number drift: pick 3 existing `Lxx` citations from prior
   eval runs (rows 2, 4, 5 from the calibration set are good
   candidates), confirm they still point at the same content after
   the extraction change.

## Out of scope (captured elsewhere)

All Tier 3 ideas in `docs/agent-hardening-roadmap.md` are unchanged
by this spec:

- Anthropic Citations API
- Multi-grep batch tool
- Citation-verifier post-pass
- Retrieval planning step
- Structured output schema
- Top-K reranking on saturated `grep_doc`

The `grep_doc` extensions (`regex`, `context_lines`) considered during
brainstorming are not on the roadmap — they were rejected as
speculative for the documented failure. File a new roadmap entry if
real evidence emerges that literal substring is the bottleneck.

## References

- arXiv 2605.15184v1 — *Is Grep All You Need? How Agent Harnesses
  Reshape Agentic Search*. Inline grep outperforms vector search on
  every harness/model pair tested for single-doc and session-memory
  Q&A (+1.7 to +23.3 points). Conclusion: harness/tooling quality
  dominates retriever choice for inline tool use.
- shaped.ai blog — *Why grep is beating your vector DB*. Grep wins
  for lexical/local query types; vector wins at corpus scale or for
  fuzzy/conceptual queries that aren't part of our task profile.
- Anthropic Citations API docs — alternative architectural path
  documented in roadmap; intentionally not adopted here.
- ast-outline (github.com/aeroxy/ast-outline) — reference for the
  outline + targeted-read pattern; ~95% token savings vs full reads.
- Claude Code system prompts (Piebald reverse-engineered) — canonical
  signature for `Read(offset, limit)`, which `read_lines` mirrors.
