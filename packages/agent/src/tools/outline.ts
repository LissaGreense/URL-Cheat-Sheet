import { tool } from 'ai';
import { z } from 'zod';
import type { Heading } from '@url-cheat-sheet/schemas';

/**
 * `_documentText` is unused — the heading list is already structured — but
 * accepted for signature parity with `makeGrepDoc`/`makeReadLines` so call
 * sites pass document context uniformly.
 */
export function makeOutline(_documentText: string, headings: Heading[]) {
  return tool({
    description:
      "Returns the document's heading structure with line numbers. Call at the start of a question to see what the document covers. After a grep_doc zero-match, call outline() to locate the relevant section before refusing.",
    inputSchema: z.strictObject({}),
    execute: async () => ({ headings })
  });
}
