import { createAnthropic } from '@ai-sdk/anthropic';
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
import { makeOutline } from './tools/outline';
import { makeReadLines } from './tools/read-lines';

const STEP_BUDGET = 12;
const FORCE_FINALIZE_AT_STEP = STEP_BUDGET - 1;

/**
 * Stream a chat response grounded in the supplied document. The model
 * calls grep/outline/read_lines to explore and ends its turn with
 * `finalize`. See `docs/specs/2026-05-20-byo-anthropic-key.md` for the
 * key-isolation and error-sanitization contract this function honors.
 *
 * @param apiKey User-supplied Anthropic key, request-scoped only.
 * @param abortSignal Aborts the upstream fetch when the client disconnects.
 */
export async function streamChat(
  messages: UIMessage[],
  document: Document,
  apiKey: string,
  abortSignal?: AbortSignal
): Promise<Response> {
  // Provider MUST be constructed inside the function — hoisting to module
  // scope or caching by apiKey creates a cross-user leak path.
  const provider = createAnthropic({ apiKey });

  // exactOptionalPropertyTypes breaks ToolSet variance across heterogeneous
  // tool literals; cast at the boundary.
  const tools = {
    grep_doc: makeGrepDoc(document.text),
    finalize,
    outline: makeOutline(document.text, document.headings),
    read_lines: makeReadLines(document.text)
  } as unknown as ToolSet;

  const result = streamText({
    model: provider('claude-sonnet-4-6'),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: [stepCountIs(STEP_BUDGET), hasToolCall('finalize')],
    temperature: 0,
    ...(abortSignal ? { abortSignal } : {}),
    onError: ({ error }) => {
      // Redacted summary only — APICallError.responseBody can contain the
      // echoed request payload including the apiKey.
      const summary: { kind: string; statusCode?: number; name?: string } = {
        kind: 'streamText.error'
      };
      if (error instanceof Error) {
        summary.name = error.name;
        const sc = (error as { statusCode?: unknown }).statusCode;
        if (typeof sc === 'number') summary.statusCode = sc;
      }
      console.error(summary);
    },
    prepareStep: ({ stepNumber }) => {
      if (stepNumber >= FORCE_FINALIZE_AT_STEP) {
        return { toolChoice: { type: 'tool', toolName: 'finalize' } };
      }
      return undefined;
    }
  });

  return result.toUIMessageStreamResponse({
    // Fixed string — the AI SDK default `String(err)` can splash
    // err.responseBody (and the apiKey within) into the client stream.
    onError: () => 'Upstream provider error'
  });
}
