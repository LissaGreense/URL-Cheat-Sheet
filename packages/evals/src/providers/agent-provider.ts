import type { ApiProvider, CallApiContextParams, ProviderResponse } from 'promptfoo';
import { extractContent, safeFetch, streamChat } from '@url-cheat-sheet/agent';
import type { Document } from '@url-cheat-sheet/schemas';
import { uiMessageChunkSchema, type UIMessage } from 'ai';
import { parseJsonEventStream } from '@ai-sdk/provider-utils';

const DEFAULT_PROVIDER_ID = 'url-cheat-sheet:agent';

/**
 * Custom promptfoo provider for the URL-Cheat-Sheet chat agent.
 *
 * promptfoo loads file-backed providers by calling
 * `new (defaultExport)({ ...providerOptions, id: providerId })`, so the
 * constructor accepts a single options object and stores the id for
 * later retrieval via `id()`.
 *
 * `callApi` validates the required `vars` (`kb_url`, `question`), then
 * runs the agent's URL pipeline: `safeFetch` to retrieve the page,
 * `extractContent` to pull the main article text, and finally
 * `streamChat` to produce a grounded answer. Failures from any stage are
 * surfaced as `{ error }` containing the discriminator `kind` so
 * promptfoo's UI shows actionable diagnostics. The streaming `Response`
 * is drained for the model's `finalize` tool call (T5 contract) via
 * `parseJsonEventStream`.
 */
export default class AgentProvider implements ApiProvider {
  private readonly providerId: string;

  constructor(options?: { id?: string }) {
    this.providerId = options?.id ?? DEFAULT_PROVIDER_ID;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!context) {
      return { error: 'AgentProvider: missing context (expected vars.kb_url and vars.question)' };
    }

    const { kb_url, question } = context.vars;

    if (typeof kb_url !== 'string') {
      return { error: 'AgentProvider: missing or invalid kb_url in context.vars' };
    }
    if (typeof question !== 'string') {
      return { error: 'AgentProvider: missing or invalid question in context.vars' };
    }

    const fetchResult = await safeFetch(kb_url);
    if (!fetchResult.ok) {
      return { error: `AgentProvider: safeFetch failed (${formatFetchError(fetchResult.error)})` };
    }

    const extractResult = extractContent(fetchResult.value.html, fetchResult.value.finalUrl);
    // ExtractError is discriminated from ExtractResult by the presence of `kind`;
    // ExtractResult is `{ text, title }` with no `kind` field.
    if ('kind' in extractResult) {
      return { error: `AgentProvider: extractContent failed (${extractResult.kind})` };
    }

    const document: Document = {
      text: extractResult.text,
      title: extractResult.title,
      sourceUrl: fetchResult.value.finalUrl
    };

    const messages: UIMessage[] = [
      {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: question }]
      }
    ];

    const response = await streamChat(messages, document);
    return {
      output: await drainAssistantText(response),
      metadata: {
        document: {
          text: extractResult.text,
          title: extractResult.title,
          sourceUrl: fetchResult.value.finalUrl
        }
      }
    };
  }
}

/**
 * Drain a UI-message SSE `Response` body and return the assistant's
 * `finalize` tool input rendered as user-visible text.
 *
 * After T5, the agent's `stopWhen: hasToolCall('finalize')` halts the loop
 * the moment the model calls `finalize`. The model's "answer" arrives
 * exclusively as the `input` field of a `tool-input-available` chunk whose
 * `toolName === 'finalize'`. Free-form text deltas (`text-*` chunks) — if
 * the model ever emits any against the prompt directive — are IGNORED:
 * `finalize.answer` wins.
 *
 * Return shape:
 *   - finalize present:  `answer` (plus ` (citations: L1, L2)` if any).
 *   - finalize missing:  empty string. The judge's `ucs-xom` empty-output
 *                        guard converts this into a hard failure.
 */
async function drainAssistantText(response: Response): Promise<string> {
  if (!response.body) {
    return '';
  }
  const parsed = parseJsonEventStream({
    stream: response.body,
    schema: uiMessageChunkSchema
  });

  let finalizeInput: { answer: string; citations: string[] } | undefined;
  const reader = parsed.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.success) continue;
      const chunk = value.value;
      if (chunk.type === 'tool-input-available' && chunk.toolName === 'finalize') {
        // `input` is typed `unknown` on the wire; `finalize.inputSchema`
        // guarantees the shape but isn't applied here (we trust the model
        // contract). Cast at the boundary.
        finalizeInput = chunk.input as { answer: string; citations: string[] };
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!finalizeInput) return '';
  const { answer, citations } = finalizeInput;
  return citations.length ? `${answer} (citations: ${citations.join(', ')})` : answer;
}

type FetchFailureError = Extract<Awaited<ReturnType<typeof safeFetch>>, { ok: false }>['error'];

function formatFetchError(error: FetchFailureError): string {
  if (error.kind === 'FETCH_BLOCKED_URL') {
    return `${error.kind} ${error.reason}`;
  }
  return error.kind;
}
