import { tool } from 'ai';
import { z } from 'zod';

const MAX_MATCHES = 20;
const CONTEXT_LINES = 2;
const MAX_PATTERNS = 10;

export interface GrepMatch {
  line: number;
  text: string;
  before: string[];
  after: string[];
}

/**
 * Case-insensitive literal substring search over a line-broken text.
 *
 * `pattern` is a single string. To OR-union multiple synonyms in one
 * call, separate alternatives with `|` — e.g. `"error|exception|fault"`
 * matches lines containing ANY of the three terms. Each alternative is
 * trimmed and lowercased; empty alternatives (from leading/trailing/
 * consecutive `|`) are discarded. Alternatives beyond `MAX_PATTERNS`
 * are silently dropped — the schema description steers the model, but
 * the runtime never rejects.
 *
 * Matches are returned in document order; the `MAX_MATCHES` cap is
 * applied across the union, not per alternative. Line numbers are
 * 1-based. Each match includes up to `CONTEXT_LINES` lines of context.
 *
 * Pipe-alternation replaces the prior `string | string[]` schema (ucs-8nl).
 * The model consistently produced pipe-joined synonym strings instead of
 * JSON arrays — the array form was awkward enough that it was effectively
 * unused. Both forms shared OR semantics; the pipe form just matches what
 * the model already writes. The OR motivation from ucs-0f3 still stands:
 * synonym exploration on RFC 7168 was the dominant tool-call sink, and
 * one pipe-joined call collapses N round-trips to 1.
 */
export function grepLines(text: string, pattern: string): GrepMatch[] {
  const needles = pattern
    .split('|')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
    .slice(0, MAX_PATTERNS);
  if (needles.length === 0) return [];

  const lines = text.split('\n');
  const matches: GrepMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lower = line.toLowerCase();
    if (!needles.some((n) => lower.includes(n))) continue;
    matches.push({
      line: i + 1,
      text: line,
      before: lines.slice(Math.max(0, i - CONTEXT_LINES), i),
      after: lines.slice(i + 1, Math.min(lines.length, i + 1 + CONTEXT_LINES))
    });
    if (matches.length >= MAX_MATCHES) break;
  }

  return matches;
}

/**
 * Factory: builds a `grep_doc` AI SDK tool that closes over the provided text.
 * Use one factory call per chat request (closure-captures that request's document).
 *
 * `pattern` is a single string; separate synonyms with `|` for one-shot
 * OR-union exploration. See `grepLines` docstring + ucs-8nl motivation.
 */
export function makeGrepDoc(documentText: string) {
  return tool({
    description:
      'Case-insensitive substring search over document lines, with ±2 lines of context. Returns matching lines labeled Lxx. To OR-union multiple synonyms in one call, separate alternatives with `|` — e.g. `"error|exception|fault"` matches lines containing ANY of the three terms. Up to 10 alternatives per call. Use short distinctive substrings, not full sentences. Empty results mean none of the terms appear in the document; if your initial query and one synonym set both return empty, the topic is not covered — answer honestly.',
    inputSchema: z.strictObject({
      pattern: z
        .string()
        .min(1)
        .describe(
          'Case-insensitive substring(s) to search. Single literal phrase, or pipe-separated synonyms for OR-union (e.g. "error|exception|fault"). Up to 10 alternatives.'
        )
    }),
    execute: async ({ pattern }) => ({
      matches: grepLines(documentText, pattern)
    })
  });
}
