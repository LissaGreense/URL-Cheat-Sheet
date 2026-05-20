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
 *
 * `apiKey` is the per-request user-supplied Anthropic key (BYO key flow,
 * see docs/specs/2026-05-20-byo-anthropic-key.md). Required, non-empty
 * string. Format-level validation (`sk-ant-` prefix) is enforced UX-side
 * so the schema doesn't over-constrain — a corporate prefix variant or
 * future Anthropic key shape change should not break the endpoint.
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
