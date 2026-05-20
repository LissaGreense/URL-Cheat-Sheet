# Agent Hardening Roadmap (Tier 3 Backlog)

This document captures the six Tier 3 architecture ideas from the agent
hardening sweep — work that is documented but not shipped. Each section
describes one idea in enough detail that a future planner can write an
implementation plan without re-doing the original audit.

Source: [`specs/2026-05-20-agent-hardening-sweep.md`](specs/2026-05-20-agent-hardening-sweep.md)
§ "Tier 3 — backlog (documented, not shipped)".

This is a backlog. Items are not ranked, and there is no recommendation
on sequencing — that's a planning decision to make at the time the work
is picked up. Items may also become obsolete if Tier 1/2 results
already close the failure mode they target.

## Anthropic Citations API

**What.** Replace the homegrown `grep_doc` tool with Anthropic's
first-party Citations API. The Citations API returns char-index or
page-range pointers into the source document that the model has been
shown, scoped to the spans the model actually used to produce its
answer. Rather than the agent emitting `Lxx` line tags that we then
verify, the API guarantees that every citation corresponds to a real
substring of the source. Adopting it deletes the entire grep-loop
surface area: no `grep_doc` tool definition, no multi-step tool
choreography, no agentic search budget.

**Why.** Citation precision is the failure mode this addresses. The
current `Lxx` format is model-generated free text and can drift
("hallucinated line numbers"); κ catches some of these as FPs but the
underlying class of bug exists by construction. Citations API removes
the class. The trade-off is format: the API speaks char-indices and
page ranges, not the `Lxx` form the chat UI renders today, so we'd
need a char-index → line-number mapper on our side to preserve the
existing UX. That mapper is straightforward (count newlines up to the
char index) but is non-trivial to test against multi-byte content.

**Cost.** Large.

**Improves.** Citation precision; secondarily reduces tool-loop
pressure (fewer round-trips, lower latency).

## Multi-grep batch tool

**What.** Extend `grep_doc` to accept an array of patterns —
`grep_doc(patterns: string[])` — and return `Record<pattern, matches[]>`
in a single tool call. The model can then issue one batched grep for
enumerative questions ("what are the safe methods?", "list the 5xx
codes") instead of N sequential round-trips through the tool loop. The
existing single-pattern behavior is preserved by passing a one-element
array. No change to the underlying `Lxx` citation format, and no
change to the `streamChat` contract — this is a tool-schema change
only.

**Why.** Latency and tool-loop pressure are the failure modes here.
Enumerative questions currently burn step budget on serial greps; each
round-trip costs an LLM turn. Batched grep collapses that to one turn.
Empty-output rate may improve as a secondary effect: tests that
previously hit the step-budget cap before producing an answer would
have more headroom. The risk is the model gets lazy and over-batches
(asking for 20 patterns when 3 would do), but the existing 20-match
cap per pattern bounds the worst case.

**Cost.** Small.

**Improves.** Latency, tool-loop pressure; secondarily empty-output
rate on step-budget-bound tests.

## Citation-verifier post-pass

**What.** After `streamText` finishes, parse every `L\d+` reference
out of the response, re-grep the source document at those line
numbers, and compare the cited line to whatever surrounding context
the model claimed it contained. Mismatches are either rejected (the
response is dropped and a retry is issued) or annotated (the UI marks
the citation as unverified). Implementation lives in a post-processor
that wraps the stream — buffer the full response, run the verifier,
then either flush or fail.

**Why.** Citation precision is the target failure mode. This closes
the citation-mismatch class that κ currently catches as the row-7 FP:
the model cites `L42` but `L42` doesn't say what the model claims.
The verifier deterministically rejects that without needing the judge
to flag it. The trade-off is UX: buffering the stream means we lose
the token-by-token rendering the chat UI currently does. Streaming
can be partially preserved by streaming text but withholding the
citation block until verification passes, at the cost of UI
complexity.

**Cost.** Medium.

**Improves.** Citation precision; reduces dependence on LLM-as-judge
for citation validation.

## Retrieval planning step

**What.** Use the AI SDK's `prepareStep` callback to force a 1-2 line
plan on step 1 of every conversation: "Question requires N facts;
I'll grep for X, Y, Z." The plan is constrained to a short structured
preamble — not free-form chain-of-thought — and is consumed by the
agent on subsequent steps as it issues tool calls. The model can
revise its plan mid-loop if greps return unexpected results, but the
initial plan is mandatory.

**Why.** Wasted-grep rate is the target failure mode, especially on
enumerative questions where the model currently fires off one grep,
reads the result, fires off another, and so on, often re-grepping
overlapping regions. Forcing a plan up front lets the model
front-load the enumeration ("I need these 5 things") and then batch
or sequence its tool calls deliberately. This composes naturally with
the multi-grep batch tool above: plan first, then issue one batched
grep that covers the planned patterns. Risk: the plan itself burns a
step, so on simple single-fact questions this is pure overhead. A
conditional `prepareStep` that only fires the plan when the question
looks enumerative would mitigate that, but adds heuristic complexity.

**Cost.** Medium.

**Improves.** Empty-output rate (fewer step-budget exhaustions),
latency, tool-loop efficiency.

## Structured output schema

**What.** Replace free-form text output with a typed
`{answer: string, citations: Citation[]}` object emitted via the AI
SDK's `experimental_output`. The model can no longer produce a string
with `Lxx` tags inline; instead it produces structured citations as a
sibling field, each with a typed shape (line number, optionally
char-range, optionally heading context). The schemas package gains a
`Citation` type, the UI gains a renderer that walks the citations
array, and the judge gains direct field access instead of regex-ing
`Lxx` out of prose.

**Why.** Citation precision and judge determinism are the target
failure modes. With structured output, citation validation becomes a
schema check rather than a regex + line-lookup. The judge no longer
needs an LLM to grade citation correctness on the structured field —
the verifier (see above) becomes deterministic. The trade-off is
blast radius: the schemas package, the chat route, the chat UI, the
judge, and any evals that consume the response shape all need to move
together. This is the largest architectural change in the backlog.

**Cost.** Large.

**Improves.** Citation precision, judge determinism; deletes a class
of LLM-as-judge calls from the eval cost model.

## Top-K reranking on saturated `grep_doc`

**What.** When `grep_doc` hits its 20-match cap on a single pattern,
the current behavior returns the first 20 matches in document order —
which is biased toward whatever happens to appear early in the
source. Replace that with a scoring pass: rank all matches by
section-heading proximity (matches under a heading that mentions the
query terms score higher) and surrounding-context tf-idf against the
pattern's tokens. Return the top-K (still bounded at 20) ranked
matches instead. This is a self-contained change in
`packages/agent/src/tools/grep-doc.ts`.

**Why.** Citation precision and empty-output rate are the targets,
specifically on broad patterns that saturate the cap. The current
"first 20" heuristic can starve the model of the relevant matches if
they happen to live later in the document; the model then either
cites the wrong section or gives up. Reranking surfaces the matches
most likely to be relevant to what the model was actually asking
about. The risk is the scoring heuristic itself being miscalibrated
— it needs unit tests against representative documents, and probably
a small fixture corpus that covers heading-dense vs heading-sparse
sources.

**Cost.** Small.

**Improves.** Citation precision on saturated-grep queries;
secondarily empty-output rate.
