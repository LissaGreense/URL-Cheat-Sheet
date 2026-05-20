import { tool } from 'ai';
import { z } from 'zod';
import type { Heading } from '@url-cheat-sheet/schemas';

/**
 * Factory: builds an `outline` AI SDK tool that closes over the document's
 * pre-extracted headings. `documentText` is accepted for parity with
 * `makeGrepDoc(documentText)` so call sites can pass document context
 * uniformly; it is intentionally unused here because the heading list is
 * already structured.
 */
export function makeOutline(_documentText: string, headings: Heading[]) {
  return tool({
    description:
      "Returns the document's heading structure with line numbers. Call at the start of a question to see what the document covers. After a grep_doc zero-match, call outline() to locate the relevant section before refusing.",
    inputSchema: z.strictObject({}),
    execute: async () => ({ headings })
  });
}
