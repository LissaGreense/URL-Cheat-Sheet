import type { ApiProvider, CallApiContextParams, ProviderResponse } from 'promptfoo';
import { extractContent, safeFetch, streamChat } from '@url-cheat-sheet/agent';
import type { Document } from '@url-cheat-sheet/schemas';
import { readUIMessageStream, uiMessageChunkSchema, type UIMessage, type UIMessageChunk } from 'ai';
import { parseJsonEventStream, type ParseResult } from '@ai-sdk/provider-utils';

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
 * is drained into a single aggregated assistant text via
 * `parseJsonEventStream` + `readUIMessageStream`.
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
    return { output: await drainAssistantText(response) };
  }
}

/**
 * Drain a UI-message SSE `Response` body and return the aggregated
 * assistant text. Uses the AI SDK v6 recipe:
 *
 *   1. `parseJsonEventStream` turns the wire bytes into typed `ParseResult`s.
 *   2. A `TransformStream` drops failed parses and unwraps `value`.
 *   3. `readUIMessageStream` aggregates raw chunks into `UIMessage` snapshots.
 *   4. We keep only the last snapshot and join its text parts.
 */
async function drainAssistantText(response: Response): Promise<string> {
  if (!response.body) {
    return '';
  }
  const parsed = parseJsonEventStream({
    stream: response.body,
    schema: uiMessageChunkSchema
  });
  const chunks = parsed.pipeThrough(
    new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
      transform(parseResult, controller) {
        if (parseResult.success) {
          controller.enqueue(parseResult.value);
        }
      }
    })
  );

  let last: UIMessage | undefined;
  for await (const msg of readUIMessageStream({ stream: chunks })) {
    last = msg;
  }

  // Aggregated `parts` use `{ type: 'text', text }` — distinct from wire
  // chunks which use `{ type: 'text-delta', delta }`. Reversing these
  // discriminators silently returns ''.
  return (last?.parts ?? [])
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

type FetchFailureError = Extract<Awaited<ReturnType<typeof safeFetch>>, { ok: false }>['error'];

function formatFetchError(error: FetchFailureError): string {
  if (error.kind === 'FETCH_BLOCKED_URL') {
    return `${error.kind} ${error.reason}`;
  }
  return error.kind;
}
