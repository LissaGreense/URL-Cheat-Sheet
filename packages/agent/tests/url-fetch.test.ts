import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { safeFetch, FETCH_DEFAULTS } from '../src/url/fetch';

function htmlResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers }
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeFetch — scheme guard', () => {
  it('rejects file:// scheme', async () => {
    const r = await safeFetch('file:///etc/passwd');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('FETCH_BLOCKED_URL');
      if (r.error.kind === 'FETCH_BLOCKED_URL') {
        expect(r.error.reason).toBe('scheme');
      }
    }
  });

  it('rejects javascript: scheme', async () => {
    const r = await safeFetch('javascript:alert(1)');
    expect(r.ok).toBe(false);
  });

  it('rejects data: scheme', async () => {
    const r = await safeFetch('data:text/html,<h1>hi</h1>');
    expect(r.ok).toBe(false);
  });
});

describe('safeFetch — SSRF guard', () => {
  it('blocks loopback by hostname literal', async () => {
    const r = await safeFetch('http://127.0.0.1/');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('FETCH_BLOCKED_URL');
      if (r.error.kind === 'FETCH_BLOCKED_URL') {
        expect(r.error.reason).toBe('private_ip');
      }
    }
  });

  it('blocks RFC 1918 ranges', async () => {
    for (const url of ['http://10.0.0.1/', 'http://192.168.1.1/', 'http://172.16.0.1/']) {
      const r = await safeFetch(url);
      expect(r.ok).toBe(false);
    }
  });

  it('blocks AWS metadata endpoint', async () => {
    const r = await safeFetch('http://169.254.169.254/');
    expect(r.ok).toBe(false);
  });

  it('blocks 0.0.0.0', async () => {
    const r = await safeFetch('http://0.0.0.0/');
    expect(r.ok).toBe(false);
  });

  it('blocks numeric-IP obfuscation (octal/integer/hex/shorthand)', async () => {
    for (const url of [
      'http://0177.0.0.1/',
      'http://2130706433/',
      'http://0x7f000001/',
      'http://127.1/'
    ]) {
      const r = await safeFetch(url);
      expect(r.ok).toBe(false);
    }
  });

  it('blocks IPv6 loopback and link-local', async () => {
    for (const url of ['http://[::1]/', 'http://[fe80::1]/']) {
      const r = await safeFetch(url);
      expect(r.ok).toBe(false);
    }
  });

  it('blocks IPv4-mapped IPv6', async () => {
    const r = await safeFetch('http://[::ffff:127.0.0.1]/');
    expect(r.ok).toBe(false);
  });
});

describe('safeFetch — content-type guard', () => {
  it('accepts text/html', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      htmlResponse('<html><body>hi</body></html>')
    );
    const r = await safeFetch('http://1.1.1.1/');
    expect(r.ok).toBe(true);
  });

  it('rejects application/json', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const r = await safeFetch('http://1.1.1.1/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('FETCH_UNSUPPORTED_CONTENT_TYPE');
  });
});

describe('safeFetch — size cap', () => {
  it('rejects responses larger than the size cap', async () => {
    const big = 'a'.repeat(FETCH_DEFAULTS.maxBytes + 10);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(htmlResponse(big));
    const r = await safeFetch('http://1.1.1.1/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('FETCH_TOO_LARGE');
  });
});

describe('safeFetch — HTTP errors', () => {
  it('surfaces 404 as FETCH_HTTP_ERROR', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } })
    );
    const r = await safeFetch('http://1.1.1.1/');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('FETCH_HTTP_ERROR');
      if (r.error.kind === 'FETCH_HTTP_ERROR') {
        expect(r.error.status).toBe(404);
      }
    }
  });
});

describe('safeFetch — redirect chain', () => {
  it('blocks redirect to a private IP', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/secret' }
      })
    );
    const r = await safeFetch('http://1.1.1.1/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('FETCH_BLOCKED_URL');
  });

  it('rejects too many redirects', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: 'http://1.1.1.1/next' }
        })
      )
    );
    const r = await safeFetch('http://1.1.1.1/');
    expect(r.ok).toBe(false);
  });
});
