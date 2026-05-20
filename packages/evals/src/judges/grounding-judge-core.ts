import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

/**
 * Input to the grounding judge.
 *
 * - `question`: the user-asked question the agent attempted to answer.
 * - `output`: the assistant's drained answer text (the thing being graded).
 * - `document`: the source document attached by the agent provider via
 *   `ProviderResponse.metadata.document` — the judge sees its full text.
 * - `judgeModel`: optional override; defaults to {@link JUDGE_DEFAULT_MODEL}.
 */
export interface GradingInput {
  question: string;
  output: string;
  document: { text: string; title: string; sourceUrl: string };
  judgeModel?: string;
}

/**
 * Result returned by {@link gradeGrounding}.
 *
 * `pass` is derived from `score >= JUDGE_PASS_THRESHOLD` — NOT from the
 * judge's self-claimed `pass`. This insulates us from a miscalibrated
 * judge contradicting its own score.
 */
export interface Verdict {
  pass: boolean;
  score: number;
  reason: string;
  raw: string;
}

/** Score at or above this counts as a pass. Anchored to spec § Research. */
export const JUDGE_PASS_THRESHOLD = 0.7;

/** Default judge model — Sonnet 4.6 (see spec § Research for the rationale). */
export const JUDGE_DEFAULT_MODEL = 'claude-sonnet-4-6';

/** Literal judge system prompt — copied verbatim from spec § "Judge prompt". */
export const JUDGE_SYSTEM = `You are grading whether an AI assistant's answer is grounded in a source
document.

You receive:
- The user's question
- The assistant's answer
- The full source document text

Grade on a single 0-1 score:
- Does the answer address the question?
- Does it cite at least one line reference in the form Lxx (xx = a number)?
- Do the cited lines exist in the document AND support the claim?
- Does the answer avoid stating facts not present in the document?

Line numbers reference the document text split on newlines, 1-indexed.

Return ONLY a JSON object on a single line, no markdown fences:
{"pass": boolean, "score": number, "reason": "one sentence"}

pass MUST equal (score >= 0.7).`;

/**
 * Grade an assistant answer against the source document it was supposed to
 * be grounded in. Calls Anthropic via the AI SDK at `temperature: 0`, parses
 * a `{pass, score, reason}` JSON object out of the response, and applies the
 * fixed 0.7 threshold.
 *
 * Empty or whitespace-only `output` short-circuits to a fail verdict without
 * an API call: there's nothing for the judge to grade groundedness against,
 * and observed behavior (see ucs-xom test 2: model burned its tool-step
 * budget without ever producing text) is that the judge happily hallucinates
 * a grounded reason from the document alone. Treat structurally ungradable
 * input as fail at the source.
 *
 * Malformed JSON, missing `score`, or `score` outside `[0, 1]` all collapse
 * to a stable fail-shape with the original response preserved on `raw` for
 * debugging.
 */
export async function gradeGrounding(input: GradingInput): Promise<Verdict> {
  if (input.output.trim().length === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'agent produced empty output (cannot grade groundedness)',
      raw: ''
    };
  }

  const model = anthropic(input.judgeModel ?? JUDGE_DEFAULT_MODEL);
  const { text } = await generateText({
    model,
    system: JUDGE_SYSTEM,
    prompt: buildUserPrompt(input),
    temperature: 0
  });

  const parsed = parseVerdict(text);
  if (parsed === null) {
    return {
      pass: false,
      score: 0,
      reason: 'malformed JSON or out-of-range score',
      raw: text
    };
  }

  return {
    pass: parsed.score >= JUDGE_PASS_THRESHOLD,
    score: parsed.score,
    reason: parsed.reason,
    raw: text
  };
}

/** Build the per-call user prompt (template per spec § "Judge prompt"). */
function buildUserPrompt(input: GradingInput): string {
  const { question, output, document } = input;
  return `Question:
${question}

Assistant's answer:
${output}

Source document (title: ${document.title}, sourceUrl: ${document.sourceUrl}):
${document.text}`;
}

/**
 * Extract and parse the judge's JSON verdict.
 *
 * Sonnet at temperature 0 mostly returns clean single-line JSON, but it
 * occasionally wraps the object in prose or markdown fences (``` ```json
 * blocks). The lazy `/\{[\s\S]*\}/` grab is a deliberate, conservative
 * recovery layer — strict enough to reject pure-prose responses, loose
 * enough to tolerate the common stylistic prefixes.
 *
 * Returns `null` on any of: no `{...}` found, JSON.parse throws, missing
 * `score`, or `score` not a finite number in `[0, 1]`.
 */
function parseVerdict(text: string): { score: number; reason: string } | null {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) {
    return null;
  }

  let obj: unknown;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }

  if (typeof obj !== 'object' || obj === null) {
    return null;
  }

  const record = obj as Record<string, unknown>;
  const score = record['score'];
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
    return null;
  }

  const reasonField = record['reason'];
  const reason = typeof reasonField === 'string' ? reasonField : '';
  return { score, reason };
}
