import { z } from 'zod';

/**
 * Minimal validation for the @ai-sdk/svelte Chat client request body.
 * Asserts the messages-array shape and per-message id/role; the deeper
 * part structure is validated by the AI SDK when it converts to model
 * messages. Top-level uses z.object (strip default) because the AI SDK
 * v6 client also sends a chat-session `id` and a `trigger` discriminator
 * we don't need to consume here.
 */
export const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['system', 'user', 'assistant']),
      parts: z.array(z.unknown())
    })
  )
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
