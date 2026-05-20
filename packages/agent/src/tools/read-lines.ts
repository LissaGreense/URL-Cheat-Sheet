import { tool } from 'ai';
import { z } from 'zod';

const MAX_LINES = 200;

export function makeReadLines(documentText: string) {
  const lines = documentText.split('\n');
  const lineCount = lines.length;

  return tool({
    description:
      'Returns up to 200 lines of raw text from the document, prefixed with `Lxx | ` so you can cite directly. Use after a `grep_doc` hit to read surrounding context, or after `outline()` to read a section. Range is 1-based and inclusive; out-of-range or inverted ranges return empty text.',
    inputSchema: z.strictObject({
      start: z.number().int().describe('1-based inclusive start line.'),
      end: z.number().int().describe('1-based inclusive end line.')
    }),
    execute: async ({ start, end }) => {
      // Range doesn't intersect [1, lineCount] — bail before clamping
      // collapses it onto a valid line.
      if (start > lineCount || end < 1) {
        return { text: '', truncated: false };
      }

      const clampedStart = Math.min(Math.max(start, 1), lineCount);
      let clampedEnd = Math.min(Math.max(end, 1), lineCount);

      if (clampedStart > clampedEnd) {
        return { text: '', truncated: false };
      }

      let truncated = false;
      if (clampedEnd - clampedStart + 1 > MAX_LINES) {
        clampedEnd = clampedStart + MAX_LINES - 1;
        truncated = true;
      }

      const text = lines
        .slice(clampedStart - 1, clampedEnd)
        .map((line, i) => `L${clampedStart + i} | ${line}`)
        .join('\n');

      return { text, truncated };
    }
  });
}
