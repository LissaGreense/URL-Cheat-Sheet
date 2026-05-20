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
 * Accepts either a single pattern string OR an array of patterns. With an
 * array, a line is a match if it contains ANY of the patterns (logical
 * OR / union). Matches are returned in document order; the `MAX_MATCHES`
 * cap is applied across the union, not per pattern. Line numbers are
 * 1-based. Each match includes up to `CONTEXT_LINES` lines of surrounding
 * context.
 *
 * OR semantics added for ucs-0f3: synonym exploration on RFC 7168 was the
 * dominant tool-call sink (the model issued 8+ separate single-pattern
 * greps for {tea, oolong, matcha, hojicha, sencha, ...}). Bundling those
 * into one call collapses 8 round-trips to 1 and leaves the step budget
 * free for navigation + finalize.
 */
export function grepLines(text: string, pattern: string | readonly string[]): GrepMatch[] {
  const needles = (Array.isArray(pattern) ? pattern : [pattern]).map((p) => p.toLowerCase());
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
 * `pattern` accepts either a single string (legacy form) or an array of up
 * to 10 strings (OR union; preferred for synonym exploration — see
 * `grepLines` docstring + ucs-0f3 motivation).
 */
export function makeGrepDoc(documentText: string) {
  return tool({
    description:
      'Case-insensitive substring search over document lines, with ±2 lines of context. Returns matching lines labeled Lxx. `pattern` can be a single string OR an array of strings — with an array, a line matches if it contains ANY of the patterns (logical OR). PREFER the array form when exploring synonyms — e.g. `["matcha","sencha","hojicha"]` in one call beats three sequential calls. Use short distinctive substrings, not full sentences. Empty results mean none of the terms appear in the document; if your initial query and one synonym set both return empty, the topic is not covered — answer honestly.',
    inputSchema: z.strictObject({
      pattern: z
        .union([
          z.string().min(1),
          z.array(z.string().min(1)).min(1).max(MAX_PATTERNS)
        ])
        .describe(
          'Case-insensitive substring(s) to search. String for a single term, or an array of up to 10 terms for OR-union exploration of synonyms.'
        )
    }),
    execute: async ({ pattern }) => ({
      matches: grepLines(documentText, pattern)
    })
  });
}
