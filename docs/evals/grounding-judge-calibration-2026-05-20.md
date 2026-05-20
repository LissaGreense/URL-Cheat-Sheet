# Grounding judge calibration — 2026-05-20

- Judge model: `claude-sonnet-4-6`
- Gold rows: 10
- κ pass threshold: 0.6

## Confusion matrix

| | human pass | human fail |
|---|---|---|
| **judge pass** | TP=5 | FP=1 |
| **judge fail** | FN=0 | TN=4 |

## Agreement

- po (observed) = 0.9000
- pe (chance) = 0.5000
- **Cohen's κ = 0.8000**

## Per-row results

- [1] Known-good: simple factual lookup with single valid citation — judge pass=true (score 0.900) vs human pass=true — agree — judge reason: "The answer correctly states that HTCPCP stands for Hyper Text Coffee Pot Control Protocol, which is supported by the document title and content, though the cited line L57 is approximate rather than exact."
- [2] Known-good: multi-citation answer where each Lxx supports a distinct sub-claim — judge pass=true (score 1.000) vs human pass=true — agree — judge reason: "The answer correctly identifies status code 418 'I'm a teapot' with valid line references (L228, L231) that exist in the document and directly support the claim, and no unsupported facts are stated."
- [3] Known-good: brief grounded answer with one citation from Wikipedia — judge pass=true (score 0.900) vs human pass=true — agree — judge reason: "The answer correctly states HTCPCP was published on 1 April 1998 as an April Fools' Day RFC, which is supported by the source document, though the cited line reference L5 is approximate rather than exact."
- [4] Known-good: short factual answer where the cited line connects two facts — judge pass=true (score 0.900) vs human pass=true — agree — judge reason: "The answer correctly identifies RFC 2324 as defining HTTP status code 418, which is supported by the document text mentioning 'RFC 2324 is published on 1 April 1998' and the 418 status code definition in the HTCPCP table; the line reference L5 is approximate but the factual claim is accurate."
- [5] Known-good: longer multi-sentence answer with multiple citations across the document — judge pass=true (score 0.850) vs human pass=true — agree — judge reason: "The answer correctly describes the Alternates header mechanism for variety selection and names the example varieties from the document, and the cited line numbers (L131, L137, L142-L144, L155) correspond to the relevant sections of the source, though the exact line numbering is approximate; the core claims are well-supported by the document text."
- [6] Known-bad: fabricated factual claim with no citation (pure hallucination) — judge pass=false (score 0.000) vs human pass=false — agree — judge reason: "The source document contains no mention of AES-256, GCM mode, ChaCha20-Poly1305, or HMAC-SHA256; the assistant's answer is entirely fabricated and not grounded in the document."
- [7] Known-bad: confident claim with a citation that points to unrelated text — judge pass=false (score 0.000) vs human pass=false — agree — judge reason: "malformed JSON or out-of-range score"
- [8] Known-bad: citation references a line number that does not exist in the document — judge pass=false (score 0.400) vs human pass=false — agree — judge reason: "The answer correctly identifies Larry Masinter as the author (supported by the document), but cites 'L9999' which does not exist in the document, failing the line reference requirement."
- [9] Known-bad: answer makes a concrete factual claim with no citation at all — judge pass=true (score 0.700) vs human pass=false — MISMATCH — judge reason: "The answer correctly states 1998 and mentions April Fools, supported by the document's mention of RFC 2324 published on April 1, 1998, but no line reference (Lxx) was cited."
- [10] Known-bad: paraphrase drifts beyond what the source actually says — judge pass=false (score 0.000) vs human pass=false — agree — judge reason: "The assistant fabricated claims about matcha, sencha, hojicha, and 60-second steeping times, none of which appear anywhere in RFC 7168, and the cited line numbers (L142, L178) do not exist in the document."

**PASS: κ >= 0.6**
