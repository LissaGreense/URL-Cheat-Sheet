import { z } from 'zod';
import { documentSchema } from './extract';

/**
 * Validation for the @ai-sdk/svelte Chat client request body. Top-level
 * uses `z.object` (strip) — never `strictObject` — because the AI SDK
 * client also sends fields like `id` and `trigger` that we don't consume.
 * `apiKey` format validation lives UX-side so a future Anthropic key
 * shape change doesn't break the endpoint.
 */
export const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['system', 'user', 'assistant']),
      parts: z.array(z.unknown())
    })
  ),
  document: documentSchema,
  apiKey: z.string().min(1)
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
