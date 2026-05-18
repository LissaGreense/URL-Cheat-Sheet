import { z } from 'zod';

/**
 * Minimal validation for the @ai-sdk/svelte Chat client request body.
 * Asserts the array shape and per-message id/role; the deeper part
 * structure is validated by the AI SDK when it converts to model
 * messages.
 */
export const chatRequestSchema = z.strictObject({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['system', 'user', 'assistant']),
      parts: z.array(z.unknown())
    })
  )
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
