import { z } from 'zod';
import { documentSchema } from './extract';

/**
 * Minimal validation for the @ai-sdk/svelte Chat client request body.
 * Asserts the messages-array shape and per-message id/role; the deeper
 * part structure is validated by the AI SDK when it converts to model
 * messages. Top-level uses z.object (strip default) because the AI SDK
 * v6 client also sends a chat-session `id` and a `trigger` discriminator
 * we don't need to consume here.
 *
 * `document` is the per-request grounding document threaded in from the
 * client's component state (see docs/specs/2026-05-19-url-fetcher.md).
 */
export const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['system', 'user', 'assistant']),
      parts: z.array(z.unknown())
    })
  ),
  // Optional in Task 1; tightened to required in Task 8 (ucs-8ad) once
  // the chat route + tests are updated to thread the document through.
  // Staged delivery — keeps each task atomic and CI green at every merge.
  document: documentSchema.optional()
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
