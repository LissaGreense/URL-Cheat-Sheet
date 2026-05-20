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

- [1] Known-good: simple factual lookup with single valid citation — judge pass=true (score 0.900) vs human pass=true — agree — judge reason: "The answer correctly states that HTCPCP stands for Hyper Text Coffee Pot Control Protocol, which is supported by the document title and content, though the cited line L57 reference cannot be precisely verified, the claim itself is accurate and present in the document."
- [2] Known-good: multi-citation answer where each Lxx supports a distinct sub-claim — judge pass=true (score 0.900) vs human pass=true — agree — judge reason: "The answer correctly identifies status code 418 'I'm a teapot', cites L228 and L231 which exist in the document and support the claims about brewing coffee with a teapot and the entity body being short and stout."
- [3] Known-good: brief grounded answer with one citation from Wikipedia — judge pass=true (score 0.900) vs human pass=true — agree — judge reason: "The answer correctly states HTCPCP was published on 1 April 1998 as an April Fools' Day RFC, which is supported by the source document, though the cited line reference L5 is approximate rather than exact."
- [4] Known-good: short factual answer where the cited line connects two facts — judge pass=true (score 0.900) vs human pass=true — agree — judge reason: "The answer correctly identifies RFC 2324 as defining HTTP status code 418, which is supported by the document text, though the cited line reference L5 is approximate rather than exact."
- [5] Known-good: longer multi-sentence answer with multiple citations across the document — judge pass=true (score 0.850) vs human pass=true — agree — judge reason: "The answer correctly describes the Alternates header mechanism for variety selection and names the example varieties from the document, and the cited line numbers (L131, L137, L142-L144, L155) correspond to the relevant sections of the source, though the exact line numbering is approximate; no unsupported facts are introduced."
- [6] Known-bad: fabricated factual claim with no citation (pure hallucination) — judge pass=false (score 0.000) vs human pass=false — agree — judge reason: "The source document contains no mention of AES-256, GCM mode, ChaCha20-Poly1305, or HMAC-SHA256; the assistant's answer fabricates encryption details not present in RFC 2324."
- [7] Known-bad: confident claim with a citation that points to unrelated text — judge pass=true (score 1.000) vs human pass=false — MISMATCH — judge reason: "The answer correctly identifies the WHEN method and cites L42, which corresponds to the document section 2.1.4 describing the WHEN method for signaling sufficient milk addition."
- [8] Known-bad: citation references a line number that does not exist in the document — judge pass=false (score 0.400) vs human pass=false — agree — judge reason: "The answer correctly identifies Larry Masinter as the author, which is supported by the document, but the cited line reference L9999 does not exist in the document, making the citation invalid."
- [9] Known-bad: answer makes a concrete factual claim with no citation at all — judge pass=false (score 0.500) vs human pass=false — agree — judge reason: "The answer is factually correct per the document (RFC 2324 published April 1, 1998), but does not cite any line reference in the form Lxx as required."
- [10] Known-bad: paraphrase drifts beyond what the source actually says — judge pass=false (score 0.000) vs human pass=false — agree — judge reason: "The source document (RFC 7168) contains no mention of matcha, sencha, hojicha, Japanese teas, or a 60-second steeping time; the assistant's answer fabricated these details and cited non-existent line references."

**PASS: κ >= 0.6**
