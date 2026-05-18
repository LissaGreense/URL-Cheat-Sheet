import { describe, it, expect, vi, beforeEach } from 'vitest';

const streamChatMock = vi.fn();

vi.mock('@url-cheat-sheet/agent', () => ({
  streamChat: (...args: unknown[]) => streamChatMock(...args)
}));

beforeEach(() => {
  streamChatMock.mockReset();
  process.env['ANTHROPIC_API_KEY'] = 'test-key';
});

async function importPost() {
  const mod = await import('../src/routes/api/chat/+server.ts');
  return mod.POST;
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('POST /api/chat', () => {
  it('400s on malformed body', async () => {
    const POST = await importPost();
    const res = await POST({ request: makeRequest({ wrong: 'shape' }) } as never);
    expect(res.status).toBe(400);
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it('500s when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const POST = await importPost();
    const body = {
      messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]
    };
    const res = await POST({ request: makeRequest(body) } as never);
    expect(res.status).toBe(500);
    const payload = await res.json();
    expect(payload.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(streamChatMock).not.toHaveBeenCalled();
  });

  it('streams the agent response on a valid body', async () => {
    streamChatMock.mockResolvedValue(
      new Response('stream-body', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    );
    const POST = await importPost();
    const body = {
      messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]
    };
    const res = await POST({ request: makeRequest(body) } as never);
    expect(res.status).toBe(200);
    expect(streamChatMock).toHaveBeenCalledOnce();
    expect(streamChatMock.mock.calls[0]?.[0]).toEqual(body.messages);
  });
});
