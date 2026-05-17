import { qaCaseSchema, type QACase } from '@url-cheat-sheet/schemas';

/**
 * Parses raw input into a validated QACase. Throws if the input does not
 * conform to the schema in @url-cheat-sheet/schemas/qa-case.
 */
export function parseCase(raw: unknown): QACase {
  return qaCaseSchema.parse(raw);
}
