import { describe, it, expect, vi, beforeEach } from 'vitest';
import { APICallError, LoadAPIKeyError } from 'ai';

const streamChatMock = vi.fn();

vi.mock('@url-cheat-sheet/agent', () => ({
  streamChat: (...args: unknown[]) => streamChatMock(...args)
}));

beforeEach(() => {
  streamChatMock.mockReset();
});

async function importPost() {
  const mod = await import('../src/routes/api/chat/+server');
  return mod.POST;
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const FIXTURE_DOCUMENT = {
  text: 'Hyper Text Coffee Pot Control Protocol.\nLine two of the doc.',
  title: 'Test doc',
  sourceUrl: 'https://example.com/test',
  headings: []
};

const FIXTURE_MESSAGES = [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }];
const FIXTURE_API_KEY = 'sk-ant-test-key';

/**
 * Build a request that advertises a `content-length` larger than the
 * server's payload guard without actually allocating that many bytes —
 * we only want to exercise the header-based pre-parse rejection path.
 */
function makeOversizeRequest(advertisedBytes: number): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(advertisedBytes)
    },
    body: '{}'
  });
}

describe('POST /api/chat', () => {
  it('413s when content-length exceeds the 1 MiB guard', async () => {
    const POST = await importPost();
    const res = await POST({
      request: makeOversizeRequest(1024 * 1024 + 1)
    } as never);
    expect(res.status).toBe(413);
    const payload = (await res.json()) as { error: string; limit: number };
    expect(payload.error).toBe('payload_too_large');
    expect(payload.limit).toBe(1024 * 1024);
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it('passes through when payload is at or under the 1 MiB guard', async () => {
    streamChatMock.mockResolvedValue(
      new Response('stream-body', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    );
    const POST = await importPost();
    const res = await POST({
      request: makeRequest({
        messages: FIXTURE_MESSAGES,
        document: FIXTURE_DOCUMENT,
        apiKey: FIXTURE_API_KEY
      })
    } as never);
    expect(res.status).toBe(200);
    expect(streamChatMock).toHaveBeenCalledOnce();
  });

  it('400s on malformed body', async () => {
    const POST = await importPost();
    const res = await POST({ request: makeRequest({ wrong: 'shape' }) } as never);
    expect(res.status).toBe(400);
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it('400s when document is missing', async () => {
    const POST = await importPost();
    const res = await POST({
      request: makeRequest({ messages: FIXTURE_MESSAGES, apiKey: FIXTURE_API_KEY })
    } as never);
    expect(res.status).toBe(400);
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it('400s when apiKey is missing from body', async () => {
    const POST = await importPost();
    const res = await POST({
      request: makeRequest({ messages: FIXTURE_MESSAGES, document: FIXTURE_DOCUMENT })
    } as never);
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error: string; issues: unknown[] };
    expect(payload.error).toBe('Invalid request body');
    expect(Array.isArray(payload.issues)).toBe(true);
    expect(payload.issues.length).toBeGreaterThan(0);
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it('400s when apiKey is empty string', async () => {
    const POST = await importPost();
    const res = await POST({
      request: makeRequest({
        messages: FIXTURE_MESSAGES,
        document: FIXTURE_DOCUMENT,
        apiKey: ''
      })
    } as never);
    expect(res.status).toBe(400);
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it('200s and forwards apiKey + abortSignal to streamChat on a valid body', async () => {
    streamChatMock.mockResolvedValue(
      new Response('stream-body', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    );
    const POST = await importPost();
    const request = makeRequest({
      messages: FIXTURE_MESSAGES,
      document: FIXTURE_DOCUMENT,
      apiKey: FIXTURE_API_KEY
    });
    const res = await POST({ request } as never);
    expect(res.status).toBe(200);
    expect(streamChatMock).toHaveBeenCalledOnce();
    expect(streamChatMock.mock.calls[0]?.[0]).toEqual(FIXTURE_MESSAGES);
    expect(streamChatMock.mock.calls[0]?.[1]).toEqual(FIXTURE_DOCUMENT);
    expect(streamChatMock.mock.calls[0]?.[2]).toBe(FIXTURE_API_KEY);
    expect(streamChatMock.mock.calls[0]?.[3]).toBe(request.signal);
  });

  it('accepts the @ai-sdk/svelte Chat client payload (id + trigger extras)', async () => {
    streamChatMock.mockResolvedValue(new Response('stream-body', { status: 200 }));
    const POST = await importPost();
    const res = await POST({
      request: makeRequest({
        id: 'chat-session-123',
        trigger: 'submit-message',
        messages: FIXTURE_MESSAGES,
        document: FIXTURE_DOCUMENT,
        apiKey: FIXTURE_API_KEY
      })
    } as never);
    expect(res.status).toBe(200);
    expect(streamChatMock).toHaveBeenCalledOnce();
  });

  it('does not include apiKey in any error response body', async () => {
    // Provider throws an error whose responseBody echoes the user's
    // apiKey — exactly the leak the spec guards against.
    streamChatMock.mockRejectedValue(
      new APICallError({
        message: `unauthorized for key ${FIXTURE_API_KEY}`,
        url: 'https://api.anthropic.com/v1/messages',
        requestBodyValues: { model: 'claude-sonnet-4-6', apiKey: FIXTURE_API_KEY },
        statusCode: 401,
        responseBody: `{"error":"invalid x-api-key: ${FIXTURE_API_KEY}"}`
      })
    );
    const POST = await importPost();
    const res = await POST({
      request: makeRequest({
        messages: FIXTURE_MESSAGES,
        document: FIXTURE_DOCUMENT,
        apiKey: FIXTURE_API_KEY
      })
    } as never);
    expect(res.status).toBe(401);
    const raw = await res.text();
    expect(raw).not.toContain('sk-ant-');
    expect(raw).not.toContain(FIXTURE_API_KEY);
  });

  it('shapes a 401 APICallError into 401 { error: "API key rejected by provider" }', async () => {
    streamChatMock.mockRejectedValue(
      new APICallError({
        message: 'unauthorized',
        url: 'https://api.anthropic.com/v1/messages',
        requestBodyValues: { model: 'claude-sonnet-4-6' },
        statusCode: 401,
        responseBody: 'provider echoed sk-ant-leak-bad'
      })
    );
    const POST = await importPost();
    const res = await POST({
      request: makeRequest({
        messages: FIXTURE_MESSAGES,
        document: FIXTURE_DOCUMENT,
        apiKey: FIXTURE_API_KEY
      })
    } as never);
    expect(res.status).toBe(401);
    const payload = (await res.json()) as { error: string };
    expect(payload).toEqual({ error: 'API key rejected by provider' });
    const raw = JSON.stringify(payload);
    expect(raw).not.toContain('sk-ant-');
  });

  it('shapes a 429 APICallError into 429 { error: "Provider rate limit or quota exceeded" }', async () => {
    streamChatMock.mockRejectedValue(
      new APICallError({
        message: 'rate limit',
        url: 'https://api.anthropic.com/v1/messages',
        requestBodyValues: { model: 'claude-sonnet-4-6' },
        statusCode: 429
      })
    );
    const POST = await importPost();
    const res = await POST({
      request: makeRequest({
        messages: FIXTURE_MESSAGES,
        document: FIXTURE_DOCUMENT,
        apiKey: FIXTURE_API_KEY
      })
    } as never);
    expect(res.status).toBe(429);
    const payload = (await res.json()) as { error: string };
    expect(payload).toEqual({ error: 'Provider rate limit or quota exceeded' });
  });

  it('shapes any other APICallError (including undefined status) into 502', async () => {
    streamChatMock.mockRejectedValue(
      new APICallError({
        message: 'gateway gone',
        url: 'https://api.anthropic.com/v1/messages',
        requestBodyValues: { model: 'claude-sonnet-4-6' },
        statusCode: 503
      })
    );
    const POST = await importPost();
    const res = await POST({
      request: makeRequest({
        messages: FIXTURE_MESSAGES,
        document: FIXTURE_DOCUMENT,
        apiKey: FIXTURE_API_KEY
      })
    } as never);
    expect(res.status).toBe(502);
    const payload = (await res.json()) as { error: string };
    expect(payload).toEqual({ error: 'Upstream provider error' });

    // And undefined statusCode also maps to 502.
    streamChatMock.mockRejectedValueOnce(
      new APICallError({
        message: 'no status',
        url: 'https://api.anthropic.com/v1/messages',
        requestBodyValues: { model: 'claude-sonnet-4-6' }
      })
    );
    const res2 = await POST({
      request: makeRequest({
        messages: FIXTURE_MESSAGES,
        document: FIXTURE_DOCUMENT,
        apiKey: FIXTURE_API_KEY
      })
    } as never);
    expect(res2.status).toBe(502);
    expect(await res2.json()).toEqual({ error: 'Upstream provider error' });
  });

  it('shapes a LoadAPIKeyError into 400 { error: "API key missing or malformed" }', async () => {
    streamChatMock.mockRejectedValue(new LoadAPIKeyError({ message: 'API key is missing' }));
    const POST = await importPost();
    const res = await POST({
      request: makeRequest({
        messages: FIXTURE_MESSAGES,
        document: FIXTURE_DOCUMENT,
        apiKey: FIXTURE_API_KEY
      })
    } as never);
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error: string };
    expect(payload).toEqual({ error: 'API key missing or malformed' });
  });

  it('rethrows unknown errors so SvelteKit can 500 them', async () => {
    const unknown = new Error('something else entirely');
    streamChatMock.mockRejectedValue(unknown);
    const POST = await importPost();
    await expect(
      POST({
        request: makeRequest({
          messages: FIXTURE_MESSAGES,
          document: FIXTURE_DOCUMENT,
          apiKey: FIXTURE_API_KEY
        })
      } as never)
    ).rejects.toBe(unknown);
  });
});
