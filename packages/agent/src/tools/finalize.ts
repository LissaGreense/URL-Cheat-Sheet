import { tool } from 'ai';
import { z } from 'zod';

/**
 * `finalize` — sentinel tool that closes the agent's turn.
 *
 * The `execute` is a trivial echo: it returns the input `{ answer, citations }`
 * as the tool result. This is required for multi-turn validity. Without it,
 * the assistant message in the conversation history contains a
 * `tool-finalize` call with no matching tool result; `convertToModelMessages`
 * walks the history on the *next* turn, sees the unresolved tool call, and
 * throws `AI_MissingToolResultsError` mid-stream (ucs-hoh).
 *
 * The agent's `stopWhen: hasToolCall('finalize')` still halts the loop the
 * moment the model calls finalize — execute runs once with the model's
 * input, the stream emits the tool result, and the loop stops. Single-turn
 * behaviour is unchanged; multi-turn no longer throws.
 *
 * Empty assistant output remains impossible by design: the model can only
 * end its turn by calling `finalize` with a non-empty `answer`, enforced by
 * the Zod `.min(1)` constraint.
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
