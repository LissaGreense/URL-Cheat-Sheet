import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentProvider from '../src/providers/agent-provider.ts';
import { extractContent, safeFetch, streamChat } from '@url-cheat-sheet/agent';
import type { UIMessage } from 'ai';

vi.mock('@url-cheat-sheet/agent', () => ({
  safeFetch: vi.fn(),
  extractContent: vi.fn(),
  streamChat: vi.fn()
}));

/**
 * Build a `Response` whose body is a UI message event stream emitting the
 * given deltas as `text-delta` chunks framed by `text-start` / `text-end`.
 *
 * Mirrors the on-wire format produced by
 * `streamText().toUIMessageStreamResponse()`: one JSON payload per `data: `
 * line, separated by blank lines (standard SSE). The `text-start` / `text-end`
 * bookends are mandatory — without them, `readUIMessageStream` will not
 * aggregate the deltas into a `TextUIPart`.
 */
function mockUIMessageStreamResponse(deltas: string[]): Response {
  const textId = 't1';
  const chunks: unknown[] = [
    { type: 'start' },
    { type: 'start-step' },
    { type: 'text-start', id: textId },
    ...deltas.map((delta) => ({ type: 'text-delta', id: textId, delta })),
    { type: 'text-end', id: textId },
    { type: 'finish-step' },
    { type: 'finish' }
  ];
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    }
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream' }
  });
}

const SUCCESSFUL_FETCH = {
  ok: true as const,
  value: {
    html: '<html><body>x</body></html>',
    contentType: 'text/html',
    finalUrl: 'https://example.com/final',
    byteSize: 27
  }
};

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

  it('drains the streamChat response and returns the joined text deltas as output', async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce(SUCCESSFUL_FETCH);
    vi.mocked(extractContent).mockReturnValueOnce({ text: 'doc text', title: 'T' });
    vi.mocked(streamChat).mockResolvedValueOnce(mockUIMessageStreamResponse(['Hello ', 'world']));

    const provider = new AgentProvider();
    const result = await provider.callApi('', {
      vars: { kb_url: 'https://example.com', question: 'q' },
      prompt: { raw: '', label: '' }
    });

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Hello world');
  });

  it('passes a Document built from the fetch finalUrl and extract result to streamChat', async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce(SUCCESSFUL_FETCH);
    vi.mocked(extractContent).mockReturnValueOnce({ text: 'doc text', title: 'T' });
    vi.mocked(streamChat).mockResolvedValueOnce(mockUIMessageStreamResponse(['ok']));

    const provider = new AgentProvider();
    await provider.callApi('', {
      vars: { kb_url: 'https://example.com', question: 'q' },
      prompt: { raw: '', label: '' }
    });

    const [, document] = vi.mocked(streamChat).mock.calls[0]!;
    expect(document).toEqual({
      text: 'doc text',
      title: 'T',
      sourceUrl: SUCCESSFUL_FETCH.value.finalUrl
    });
  });

  it('passes a single user UIMessage with the question text and a non-empty id', async () => {
    vi.mocked(safeFetch).mockResolvedValueOnce(SUCCESSFUL_FETCH);
    vi.mocked(extractContent).mockReturnValueOnce({ text: 'doc text', title: 'T' });
    vi.mocked(streamChat).mockResolvedValueOnce(mockUIMessageStreamResponse(['ok']));

    const provider = new AgentProvider();
    await provider.callApi('', {
      vars: { kb_url: 'https://example.com', question: 'why is the sky blue?' },
      prompt: { raw: '', label: '' }
    });

    const [messages] = vi.mocked(streamChat).mock.calls[0]! as [UIMessage[], unknown];
    expect(messages).toHaveLength(1);
    const [msg] = messages;
    expect(msg.role).toBe('user');
    expect(typeof msg.id).toBe('string');
    expect(msg.id.length).toBeGreaterThan(0);
    expect(msg.parts).toEqual([{ type: 'text', text: 'why is the sky blue?' }]);
  });
});
