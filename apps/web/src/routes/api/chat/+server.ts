import { json, type RequestHandler } from '@sveltejs/kit';
import type { UIMessage } from 'ai';
import { streamChat } from '@url-cheat-sheet/agent';
import { chatRequestSchema } from '@url-cheat-sheet/schemas';

/**
 * Chat endpoint. Validates the @ai-sdk/svelte Chat client body (now
 * including the per-request grounding document), then streams the model
 * response (with the grep_doc tool wired in) back to the browser via the
 * AI SDK's UI message stream.
 */
export const POST: RequestHandler = async ({ request }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Body must be valid JSON' }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
  }

  if (!process.env['ANTHROPIC_API_KEY']) {
    return json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  // Schema validates structure (id, role, parts: unknown[]); AI SDK
  // validates each part shape inside convertToModelMessages. One
  // boundary cast bridges the two type worlds.
  return streamChat(parsed.data.messages as UIMessage[], parsed.data.document);
};
