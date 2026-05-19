import type { AssertionValueFunctionContext, GradingResult } from 'promptfoo';
import { gradeGrounding } from '../judges/grounding-judge-core';

/**
 * Thin promptfoo assertion adapter that routes provider-attached document
 * context and the question variable into {@link gradeGrounding}.
 *
 * Returns a fail-shape (without invoking the judge) when the document is
 * missing, malformed, has empty text, or when `context.vars.question` is
 * missing or non-string. Otherwise maps the core `Verdict` onto promptfoo's
 * `GradingResult`, dropping the debug-only `raw` field.
 */
export default async function gradeGroundingAssertion(
  output: string,
  context: AssertionValueFunctionContext
): Promise<GradingResult> {
  const document = context.providerResponse?.metadata?.['document'] as unknown;
  if (
    typeof document !== 'object' ||
    document === null ||
    typeof (document as { text?: unknown }).text !== 'string' ||
    (document as { text: string }).text.length === 0 ||
    typeof (document as { title?: unknown }).title !== 'string' ||
    typeof (document as { sourceUrl?: unknown }).sourceUrl !== 'string' ||
    (document as { sourceUrl: string }).sourceUrl.length === 0
  ) {
    return { pass: false, score: 0, reason: 'no document attached to provider response' };
  }

  const question = context.vars?.['question'];
  if (typeof question !== 'string') {
    return { pass: false, score: 0, reason: 'no question in context.vars' };
  }

  const verdict = await gradeGrounding({
    question,
    output,
    document: document as { text: string; title: string; sourceUrl: string }
  });
  return { pass: verdict.pass, score: verdict.score, reason: verdict.reason };
}
