import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentProvider from '../src/providers/agent-provider.ts';
import { extractContent, safeFetch, streamChat } from '@url-cheat-sheet/agent';

vi.mock('@url-cheat-sheet/agent', () => ({
  safeFetch: vi.fn(),
  extractContent: vi.fn(),
  streamChat: vi.fn()
}));

describe('AgentProvider', () => {
  beforeEach(() => {
    vi.mocked(safeFetch).mockReset();
    vi.mocked(extractContent).mockReset();
    vi.mocked(streamChat).mockReset();
  });

  it('round-trips a constructor-supplied id', () => {
    const provider = new AgentProvider({ id: 'custom-id' });
    expect(provider.id()).toBe('custom-id');
  });

  it('falls back to the default id when no constructor argument is supplied', () => {
    const provider = new AgentProvider();
    expect(provider.id()).toBe('url-cheat-sheet:agent');
  });

  it('returns an error naming the missing var when context.vars is empty', async () => {
    const provider = new AgentProvider();
    const result = await provider.callApi('', {
      vars: {},
      prompt: { raw: '', label: '' }
    });
    expect(result.error).toMatch(/kb_url|question/i);
  });

  it('returns an error mentioning FETCH_TIMEOUT when safeFetch times out', async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce({
      ok: false,
      error: { kind: 'FETCH_TIMEOUT' }
    });

    const provider = new AgentProvider();
    const result = await provider.callApi('', {
      vars: { kb_url: 'https://example.com', question: 'q' },
      prompt: { raw: '', label: '' }
    });

    expect(result.error).toMatch(/FETCH_TIMEOUT/);
    expect(vi.mocked(streamChat)).not.toHaveBeenCalled();
  });

  it('returns an error mentioning EMPTY_EXTRACTION when extractContent yields no article', async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce({
      ok: true,
      value: {
        html: '<html></html>',
        contentType: 'text/html',
        finalUrl: 'https://example.com/',
        byteSize: 13
      }
    });
    vi.mocked(extractContent).mockReturnValueOnce({ kind: 'EMPTY_EXTRACTION' });

    const provider = new AgentProvider();
    const result = await provider.callApi('', {
      vars: { kb_url: 'https://example.com', question: 'q' },
      prompt: { raw: '', label: '' }
    });

    expect(result.error).toMatch(/EMPTY_EXTRACTION/);
    expect(vi.mocked(streamChat)).not.toHaveBeenCalled();
  });

  it('returns an error mentioning FETCH_BLOCKED_URL and its reason when SSRF blocks the URL', async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce({
      ok: false,
      error: { kind: 'FETCH_BLOCKED_URL', reason: 'private_ip' }
    });

    const provider = new AgentProvider();
    const result = await provider.callApi('', {
      vars: { kb_url: 'https://example.com', question: 'q' },
      prompt: { raw: '', label: '' }
    });

    expect(result.error).toMatch(/FETCH_BLOCKED_URL/);
    expect(result.error).toMatch(/private_ip/);
    expect(vi.mocked(streamChat)).not.toHaveBeenCalled();
  });
});
