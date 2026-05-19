import type { ApiProvider, CallApiContextParams, ProviderResponse } from 'promptfoo';

const DEFAULT_PROVIDER_ID = 'url-cheat-sheet:agent';

/**
 * Custom promptfoo provider for the URL-Cheat-Sheet chat agent.
 *
 * promptfoo loads file-backed providers by calling
 * `new (defaultExport)({ ...providerOptions, id: providerId })`, so the
 * constructor accepts a single options object and stores the id for
 * later retrieval via `id()`.
 *
 * This scaffold validates the required `vars` (`kb_url`, `question`)
 * and returns a structured error when either is missing. The real
 * fetch / extract / streamChat pipeline is added in subsequent tasks.
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

    return { error: 'AgentProvider: pipeline not yet implemented' };
  }
}
