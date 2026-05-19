import type { ApiProvider, CallApiContextParams, ProviderResponse } from 'promptfoo';
import { extractContent, safeFetch } from '@url-cheat-sheet/agent';

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
 * runs the agent's URL pipeline: `safeFetch` to retrieve the page, and
 * `extractContent` to pull the main article text. Failures from either
 * stage are surfaced as `{ error }` containing the discriminator `kind`
 * so promptfoo's UI shows actionable diagnostics. The streamChat hop is
 * added in a subsequent task.
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

    return { error: 'AgentProvider: streamChat not yet implemented' };
  }
}

type FetchFailureError = Extract<Awaited<ReturnType<typeof safeFetch>>, { ok: false }>['error'];

function formatFetchError(error: FetchFailureError): string {
  if (error.kind === 'FETCH_BLOCKED_URL') {
    return `${error.kind} ${error.reason}`;
  }
  return error.kind;
}
