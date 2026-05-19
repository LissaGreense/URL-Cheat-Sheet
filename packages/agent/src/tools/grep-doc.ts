import { tool } from 'ai';
import { z } from 'zod';

const MAX_MATCHES = 20;
const CONTEXT_LINES = 2;

export interface GrepMatch {
  line: number;
  text: string;
  before: string[];
  after: string[];
}

/**
 * Case-insensitive literal substring search over a line-broken text.
 * Returns up to MAX_MATCHES hits, each with up to CONTEXT_LINES lines
 * of surrounding context. Line numbers are 1-based.
 */
export function grepLines(text: string, pattern: string): GrepMatch[] {
  const lines = text.split('\n');
  const needle = pattern.toLowerCase();
  const matches: GrepMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.toLowerCase().includes(needle)) continue;
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
 */
export function makeGrepDoc(documentText: string) {
  return tool({
    description:
      'Search the loaded document for a case-insensitive substring. Returns matching lines with up to two lines of surrounding context. Pattern is treated as literal text, not regex.',
    inputSchema: z.strictObject({
      pattern: z.string().describe('Case-insensitive substring to search the loaded document.')
    }),
    execute: async ({ pattern }) => ({
      matches: grepLines(documentText, pattern)
    })
  });
}
