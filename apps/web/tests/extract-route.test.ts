import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../src/routes/api/extract/+server';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/extract', () => {
  it('returns 400 on missing url', async () => {
    const res = await POST({ request: makeRequest({}) } as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid url string', async () => {
    const res = await POST({ request: makeRequest({ url: 'not a url' }) } as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 with FETCH_BLOCKED_URL on private IP', async () => {
    const res = await POST({ request: makeRequest({ url: 'http://127.0.0.1/' }) } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.kind).toBe('FETCH_BLOCKED_URL');
  });

  it('returns 200 with extract + scan on success', async () => {
    const html = `<!doctype html><html><head><title>T</title></head><body>
      <article><p>${'word '.repeat(80)}</p></article>
    </body></html>`;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    );
    const res = await POST({ request: makeRequest({ url: 'http://1.1.1.1/' }) } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toContain('word');
    expect(body.title).toBe('T');
    expect(body.scan.safe).toBe(true);
  });
});
