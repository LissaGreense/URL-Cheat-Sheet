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

/**
 * Maximum number of model rounds before the loop stops. Set to 12 (up from 10)
 * after ucs-0f3 documented a 3/10 empty-output flake on RFC 7168's
 * `trap_japanese_tea` case: the model burned 14 tool calls across 10 steps
 * exploring tea synonyms (oolong, matcha, puer, herbal, …) without reaching
 * the step where it would have called `finalize`. Two extra steps of
 * headroom prevents the most common flake; `FORCE_FINALIZE_AT_STEP` is the
 * structural backstop for the rest.
 */
const STEP_BUDGET = 12;

/**
 * Step (0-indexed in AI SDK v6) at which `prepareStep` flips `toolChoice` to
 * force `finalize`. Set to `STEP_BUDGET - 1`: the LAST allowed step is
 * reserved exclusively for `finalize`. The model gets `STEP_BUDGET - 1` free
 * exploration steps; if it hasn't called `finalize` by then, the last step
 * is forced.
 *
 * This makes empty-output structurally impossible at the agent layer: even
 * if the model would have exhausted the budget exploring, the final step is
 * guaranteed to invoke `finalize`. The Zod `answer.min(1)` constraint then
 * guarantees the answer is non-empty when emitted.
 */
const FORCE_FINALIZE_AT_STEP = STEP_BUDGET - 1;

/**
 * Stream a chat response grounded in the supplied document. The model may
 * call grep/outline/read_lines tools to explore, then MUST end its turn by
 * calling `finalize` with its answer + citations.
 *
 * **Per-request isolation (BYO key).** The `apiKey` is the user-supplied
 * Anthropic key from the current chat turn's request body. The provider is
 * constructed *inside* this function via `createAnthropic({ apiKey })` —
 * never at module scope, never cached, never attached to `globalThis`. When
 * this function returns, the closure drops and the key goes out of scope.
 * See `docs/specs/2026-05-20-byo-anthropic-key.md` § "Server-side
 * discipline" and § "Per-request isolation" for why this is normative.
 *
 * **AbortSignal threading.** The caller (the `/api/chat` route handler)
 * should pass `event.request.signal` so that a browser navigation, tab
 * close, or explicit Stop click aborts the Anthropic fetch — without this
 * an abandoned stream keeps the function (and the user's spend) alive
 * until the platform's max-duration cap.
 *
 * **Error handling.** Two layers of error sanitization protect the user's
 * key and request body from leaking:
 *   - `streamText({ onError })` observes errors server-side; the handler
 *     logs a redacted summary and never touches `err.responseBody` (which
 *     would otherwise contain the provider's echoed request payload).
 *   - `toUIMessageStreamResponse({ onError })` overrides the AI SDK's
 *     default `String(err)` with a fixed `'Upstream provider error'`
 *     string. Errors thrown *after* response headers have flushed surface
 *     as in-stream `error` parts; the fixed string keeps those safe
 *     regardless of what Anthropic returns.
 *
 * Structural empty-output prevention is a 3-layer cake:
 *   1. `hasToolCall('finalize')` stop condition halts immediately when the
 *      model voluntarily calls `finalize` (the normal happy path).
 *   2. `prepareStep` forces `toolChoice: finalize` on the last allowed step
 *      so the model is structurally compelled to finalize if it hasn't yet
 *      (catches the ucs-0f3 flake — model exploring synonyms past the
 *      voluntary-finalize point).
 *   3. `agent-provider.ts` synthesises a typed refusal on the rare case the
 *      stream still ends without a `finalize` chunk (defense in depth — the
 *      provider's safety net, NOT a normal code path).
 *
 * Returns a `Response` carrying the AI SDK UI message stream — the caller
 * pipes it straight back to the client.
 *
 * @param messages The UI message history from the @ai-sdk/svelte Chat client.
 * @param document The per-request grounding document (text + headings).
 * @param apiKey The user-supplied Anthropic API key (request-scoped only).
 * @param abortSignal Optional signal that aborts the upstream fetch when
 *   the client disconnects.
 */
export async function streamChat(
  messages: UIMessage[],
  document: Document,
  apiKey: string,
  abortSignal?: AbortSignal
): Promise<Response> {
  // Provider is constructed INSIDE the function body. Hoisting this to
  // module scope (or caching it keyed by apiKey) would create a
  // cross-user leak path — the spec forbids this explicitly.
  const provider = createAnthropic({ apiKey });

  // The cast to `ToolSet` is required because `exactOptionalPropertyTypes`
  // breaks variance on `Schema<OBJECT>['_type']`: a heterogeneous tools
  // object literal (one tool with `execute`, one without) cannot satisfy
  // `ToolSet`'s `Tool<...> | Tool<...>` union directly even though every
  // member is shaped correctly. Cast at the boundary — runtime behavior
  // is unchanged; only the input-schema variance check is bypassed.
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
    // Spread conditionally so `exactOptionalPropertyTypes` doesn't see
    // an explicit `abortSignal: undefined` (which the AI SDK's optional
    // typing rejects).
    ...(abortSignal ? { abortSignal } : {}),
    onError: ({ error }) => {
      // Redacted summary only. NEVER pass `error` directly to console.* —
      // the AI SDK's APICallError carries `responseBody` which can contain
      // the provider's echoed request payload (including the apiKey).
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
      // On the last allowed step, force the model to call finalize. This is
      // the structural backstop for ucs-0f3: without it, the model can burn
      // the entire budget exploring tools and never voluntarily finalize.
      if (stepNumber >= FORCE_FINALIZE_AT_STEP) {
        return { toolChoice: { type: 'tool', toolName: 'finalize' } };
      }
      return undefined;
    }
  });

  return result.toUIMessageStreamResponse({
    // Fixed string for every error — the AI SDK default `String(err)`
    // could splash `err.responseBody` (containing the provider's echoed
    // request payload, including the apiKey) into the client stream.
    onError: () => 'Upstream provider error'
  });
}
