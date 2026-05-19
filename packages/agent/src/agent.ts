import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import type { Document } from '@url-cheat-sheet/schemas';
import { SYSTEM_PROMPT } from './prompt';
import { makeGrepDoc } from './tools/grep-doc';

/**
 * Stream a chat response grounded in the supplied document. The model may
 * call the grep_doc tool zero or more times before producing its answer.
 *
 * Returns a `Response` carrying the AI SDK UI message stream — the caller
 * pipes it straight back to the client.
 */
export async function streamChat(messages: UIMessage[], document: Document): Promise<Response> {
  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: { grep_doc: makeGrepDoc(document.text) },
    stopWhen: stepCountIs(5)
  });
  return result.toUIMessageStreamResponse();
}
