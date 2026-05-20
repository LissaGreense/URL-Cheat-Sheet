import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  hasToolCall,
  stepCountIs,
  streamText,
  type ToolSet,
  type UIMessage
} from 'ai';
import type { Document } from '@url-cheat-sheet/schemas';
import { SYSTEM_PROMPT } from './prompt';
import { makeGrepDoc } from './tools/grep-doc';
import { finalize } from './tools/finalize';

/**
 * Stream a chat response grounded in the supplied document. The model may
 * call the `grep_doc` tool zero or more times, then MUST end its turn by
 * calling `finalize` with its answer + citations. The `hasToolCall('finalize')`
 * stop condition makes empty assistant output structurally impossible.
 *
 * The step budget is 10 (up from 8) because `finalize` itself counts as a
 * tool call — leaving 9 steps for `grep_doc` exploration.
 *
 * Returns a `Response` carrying the AI SDK UI message stream — the caller
 * pipes it straight back to the client.
 */
export async function streamChat(messages: UIMessage[], document: Document): Promise<Response> {
  // The cast to `ToolSet` is required because `exactOptionalPropertyTypes`
  // breaks variance on `Schema<OBJECT>['_type']`: a heterogeneous tools
  // object literal (one tool with `execute`, one without) cannot satisfy
  // `ToolSet`'s `Tool<...> | Tool<...>` union directly even though every
  // member is shaped correctly. Cast at the boundary — runtime behavior
  // is unchanged; only the input-schema variance check is bypassed.
  const tools = {
    grep_doc: makeGrepDoc(document.text),
    finalize
  } as unknown as ToolSet;
  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: [stepCountIs(10), hasToolCall('finalize')],
    temperature: 0
  });
  return result.toUIMessageStreamResponse();
}
