import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import { SYSTEM_PROMPT } from './prompt';
import { makeGrepDoc } from './tools/grep-doc';
import bundledDoc from './data/rfc2324.txt?raw';

/**
 * Stream a chat response grounded in the loaded document. The model may call
 * the grep_doc tool zero or more times before producing its answer.
 *
 * Returns a `Response` carrying the AI SDK UI message stream — the caller
 * pipes it straight back to the client.
 *
 * NOTE: this task wires the bundled RFC text as the document temporarily.
 * Task 8 replaces this with the per-request `Document` from the chat body.
 */
export async function streamChat(messages: UIMessage[]): Promise<Response> {
  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: { grep_doc: makeGrepDoc(bundledDoc) },
    stopWhen: stepCountIs(5)
  });
  return result.toUIMessageStreamResponse();
}
