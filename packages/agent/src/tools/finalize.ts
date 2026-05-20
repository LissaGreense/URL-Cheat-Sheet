import { tool } from 'ai';
import { z } from 'zod';

/**
 * `finalize` — client-side sentinel tool that closes the agent's turn.
 *
 * Defined intentionally **without** an `execute` function: this is the
 * v6 "client-side tool" pattern (see JSDoc in
 * `@ai-sdk/provider-utils/dist/index.d.ts:1038`). The model emits a
 * tool call, the SDK forwards it to the client as a `tool-input-available`
 * chunk, and the agent's `stopWhen: hasToolCall('finalize')` halts the
 * loop without ever invoking server code.
 *
 * The result: empty assistant output becomes impossible by design — the
 * model can only end its turn by calling `finalize` with a non-empty
 * `answer`, enforced by the Zod `.min(1)` constraint.
 */
export const finalize = tool({
  description:
    'Emit your final answer. Call this exactly once at the end of your turn. The `answer` field is shown verbatim to the user; the `citations` list is rendered after the answer. Calls with an empty `answer` are rejected.',
  inputSchema: z.strictObject({
    answer: z.string().min(1),
    citations: z.array(z.string()).default([])
  })
});
