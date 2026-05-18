import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import { SYSTEM_PROMPT } from './prompt';
import { grepRfc } from './tools/grep-rfc';

/**
 * Stream a chat response grounded in RFC 2324. The model may call the
 * grep_rfc tool zero or more times before producing its answer.
 *
 * Returns a `Response` carrying the AI SDK UI message stream — the
 * caller pipes it straight back to the client. The Anthropic API key
 * is read from process.env.ANTHROPIC_API_KEY by the provider; missing
 * keys surface as a runtime error from the provider call, which the
 * route handler converts to a 500.
 */
export async function streamChat(messages: UIMessage[]): Promise<Response> {
  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: { grep_rfc: grepRfc },
    stopWhen: stepCountIs(5)
  });
  return result.toUIMessageStreamResponse();
}
