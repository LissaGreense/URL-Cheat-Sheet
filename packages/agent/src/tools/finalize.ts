import { tool } from 'ai';
import { z } from 'zod';

/**
 * Sentinel tool that closes the agent's turn. `stopWhen: hasToolCall(
 * 'finalize')` halts the loop the moment the model calls this. The
 * `execute` is a trivial echo and MUST stay: without a tool result in
 * the assistant message, `convertToModelMessages` throws
 * `AI_MissingToolResultsError` on the next turn against the unresolved
 * call.
 */
export const finalize = tool({
  description:
    'Emit your final answer. Call this exactly once at the end of your turn. The `answer` field is shown verbatim to the user; the `citations` list is rendered after the answer. Calls with an empty `answer` are rejected.',
  inputSchema: z.strictObject({
    answer: z.string().min(1),
    citations: z.array(z.string()).default([])
  }),
  execute: async (input) => input
});
