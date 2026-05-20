import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The agent module is partially mocked so individual tests can force
 * specific pipeline stages to throw — that exercises ucs-tz0's
 * defense-in-depth try/catch wrapping. The default behaviour passes
 * through to the real implementations, so the happy-path tests still
 * exercise real Readability + vard logic.
 */
vi.mock('@url-cheat-sheet/agent', async () => {
  const actual =
    await vi.importActual<typeof import('@url-cheat-sheet/agent')>('@url-cheat-sheet/agent');
  return {
    ...actual,
    extractContent: vi.fn(actual.extractContent)
  };
});

import { POST } from '../src/routes/api/extract/+server';
import { extractContent } from '@url-cheat-sheet/agent';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(extractContent).mockClear();
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

  /**
   * ucs-tz0: defense-in-depth. Before this, an unhandled exception in
   * any pipeline stage (safeFetch / extractContent / vardScanner.scan)
   * fell through to SvelteKit's default error path → Vercel returned a
   * bare 502 with no body → debugging required redeploying with extra
   * logging. The wrapper turns every uncaught exception into a typed
   * INTERNAL_ERROR response with the error class logged server-side.
   */
  it('returns 500 with INTERNAL_ERROR kind when a pipeline stage throws unhandled', async () => {
    const html = `<!doctype html><html><head><title>T</title></head><body>
      <article><p>${'word '.repeat(80)}</p></article>
    </body></html>`;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    );
    vi.mocked(extractContent).mockImplementationOnce(() => {
      throw new TypeError('simulated Readability crash');
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await POST({ request: makeRequest({ url: 'http://1.1.1.1/' }) } as never);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.kind).toBe('INTERNAL_ERROR');
      expect(typeof body.message).toBe('string');
      // Server log surfaces the exception class so post-mortem doesn't
      // require redeploying with extra instrumentation.
      expect(consoleErrorSpy).toHaveBeenCalled();
      const callArg = consoleErrorSpy.mock.calls[0]?.[0];
      expect(callArg).toMatchObject({
        kind: 'extract.unhandled',
        errorClass: 'TypeError'
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
