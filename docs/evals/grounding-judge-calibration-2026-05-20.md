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

- [1] Known-good: simple factual lookup with single valid citation — judge pass=true (score 0.900) vs human pass=true — agree — judge reason: "The answer correctly states that HTCPCP stands for Hyper Text Coffee Pot Control Protocol, which is supported by the document title and content (e.g., line referencing 'Hyper Text Coffee Pot Control Protocol (HTCPCP/1.0)'), though the cited line L57 may not be precisely accurate, the core claim is well-supported by the document."
- [2] Known-good: multi-citation answer where each Lxx supports a distinct sub-claim — judge pass=true (score 0.900) vs human pass=true — agree — judge reason: "The answer correctly identifies status code 418 'I'm a teapot' and the detail about the entity body being short and stout, both supported by the document's section 2.3.2, though the line numbers cited (L228, L231) are approximate and the document does support these claims."
- [3] Known-good: brief grounded answer with one citation from Wikipedia — judge pass=true (score 1.000) vs human pass=true — agree — judge reason: "The answer correctly states HTCPCP was published on 1 April 1998 as an April Fools' Day RFC, which is directly supported by the source document, and cites line L5 which contains this information."
- [4] Known-good: short factual answer where the cited line connects two facts — judge pass=true (score 0.900) vs human pass=true — agree — judge reason: "The answer correctly identifies RFC 2324 as defining HTTP status code 418, which is supported by the document text, though the cited line reference L5 is approximate rather than exact."
- [5] Known-good: longer multi-sentence answer with multiple citations across the document — judge pass=true (score 0.850) vs human pass=true — agree — judge reason: "The answer correctly describes the Alternates header mechanism for variety selection and names the example varieties from the document, and the cited line numbers (L131, L137, L142-L144, L155) correspond to the relevant sections of the source, though the exact line numbering is approximate; the core claims are well-supported by the document text."
- [6] Known-bad: fabricated factual claim with no citation (pure hallucination) — judge pass=false (score 0.000) vs human pass=false — agree — judge reason: "The source document contains no mention of AES-256, GCM mode, ChaCha20-Poly1305, or HMAC-SHA256; the assistant's answer fabricates encryption details not present in RFC 2324."
- [7] Known-bad: confident claim with a citation that points to unrelated text — judge pass=true (score 1.000) vs human pass=false — MISMATCH — judge reason: "The answer correctly identifies the WHEN method as the signal for sufficient milk, cites L42, and the cited lines in the document directly support this claim without introducing any unsupported facts."
- [8] Known-bad: citation references a line number that does not exist in the document — judge pass=false (score 0.400) vs human pass=false — agree — judge reason: "The answer correctly identifies Larry Masinter as the author, which is supported by the document, but cites 'L9999' which does not exist in the document, making the line reference invalid."
- [9] Known-bad: answer makes a concrete factual claim with no citation at all — judge pass=false (score 0.500) vs human pass=false — agree — judge reason: "The answer is factually correct per the document (RFC 2324 published April 1, 1998), but does not cite any line reference in the form Lxx as required."
- [10] Known-bad: paraphrase drifts beyond what the source actually says — judge pass=false (score 0.000) vs human pass=false — agree — judge reason: "The assistant fabricated claims about matcha, sencha, hojicha, and 60-second steeping times that do not appear anywhere in RFC 7168, and the cited line numbers (L142, L178) do not exist in the document."

**PASS: κ >= 0.6**
