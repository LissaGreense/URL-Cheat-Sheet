import { validateHostIsPublic, SsrfBlockedError } from './ssrf';

export const FETCH_DEFAULTS = {
  timeoutMs: 10_000,
  maxBytes: 5 * 1024 * 1024, // 5MB
  maxRedirects: 5,
  userAgent: 'URL-Cheat-Sheet/0.1 (+https://github.com/LissaGreense/URL-Cheat-Sheet)',
  allowedSchemes: new Set(['http:', 'https:']),
  allowedPorts: new Set(['', '80', '443']),
  allowedContentTypes: ['text/html', 'application/xhtml+xml']
} as const;

export type FetchSuccess = {
  ok: true;
  value: {
    html: string;
    contentType: string;
    finalUrl: string;
    byteSize: number;
  };
};

export type FetchFailure = {
  ok: false;
  error:
    | { kind: 'FETCH_TIMEOUT' }
    | { kind: 'FETCH_TOO_LARGE'; sizeBytes: number }
    | { kind: 'FETCH_BLOCKED_URL'; reason: 'scheme' | 'port' | 'private_ip' | 'redirect_loop' }
    | { kind: 'FETCH_UNSUPPORTED_CONTENT_TYPE'; contentType: string }
    | { kind: 'FETCH_HTTP_ERROR'; status: number }
    | { kind: 'FETCH_NETWORK'; message: string };
};

export type FetchResult = FetchSuccess | FetchFailure;

function blocked(reason: 'scheme' | 'port' | 'private_ip' | 'redirect_loop'): FetchFailure {
  return { ok: false, error: { kind: 'FETCH_BLOCKED_URL', reason } };
}

function contentTypeAllowed(ct: string): boolean {
  const base = ct.split(';')[0]!.trim().toLowerCase();
  return (FETCH_DEFAULTS.allowedContentTypes as readonly string[]).includes(base);
}

function charsetFromContentType(ct: string): string {
  const match = /charset=([^;]+)/i.exec(ct);
  return match?.[1]?.trim() ?? 'utf-8';
}

async function readWithSizeCap(
  res: Response,
  max: number
): Promise<{ bytes: Uint8Array; tooLarge: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(0), tooLarge: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > max) {
        try {
          await reader.cancel();
        } catch {
          /* noop */
        }
        return { bytes: new Uint8Array(0), tooLarge: true };
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { bytes: merged, tooLarge: false };
}

function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

/**
 * Fetch a URL with composed SSRF, timeout, size, content-type, and redirect
 * guards. Validates that the URL's host resolves to public unicast IPs only,
 * then calls `fetch` with the original URL. Uses `redirect: 'manual'` so each
 * hop re-runs `validateHostIsPublic` against the next target.
 *
 * A small TOCTOU rebinding window exists between our DNS check and `fetch`'s
 * connect-time resolution; mitigated in practice by short DNS TTLs and the
 * fact that this fetcher runs in Vercel serverless (no VPC routes to internal
 * services). The alternative — rewriting the URL hostname to a pinned IP and
 * forwarding the original host via the `Host` header — breaks under
 * Node/undici because undici drives TLS SNI from the URL hostname, producing
 * `ssl/tls alert handshake failure` against any origin that requires correct
 * SNI (Cloudflare, GitHub Pages, etc.). The portable shape below works on
 * BOTH Bun and Node.
 *
 * CRITICAL FOOTGUN: Never reach for `undici.Agent` / `http.Agent` /
 * `connect.servername` tricks to keep the pinning approach alive on Node —
 * those constructs silently no-op on Bun (Bun's `fetch` ignores Node agents),
 * so any "fix" using them regresses Bun. Keep this implementation runtime-
 * agnostic.
 *
 * Returns a discriminated union; the caller pattern-matches `result.ok`.
 */
export async function safeFetch(input: string, init: RequestInit = {}): Promise<FetchResult> {
  let target: URL;
  try {
    target = new URL(input);
  } catch {
    return blocked('scheme');
  }

  for (let hop = 0; hop < FETCH_DEFAULTS.maxRedirects; hop++) {
    if (!(FETCH_DEFAULTS.allowedSchemes as ReadonlySet<string>).has(target.protocol))
      return blocked('scheme');
    if (!(FETCH_DEFAULTS.allowedPorts as ReadonlySet<string>).has(target.port))
      return blocked('port');

    const host = target.hostname.replace(/^\[|\]$/g, '');

    try {
      await validateHostIsPublic(host);
    } catch (e) {
      if (e instanceof SsrfBlockedError) return blocked('private_ip');
      return { ok: false, error: { kind: 'FETCH_NETWORK', message: String(e) } };
    }

    let res: Response;
    try {
      res = await fetch(target, {
        ...init,
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal: AbortSignal.timeout(FETCH_DEFAULTS.timeoutMs),
        headers: {
          ...init.headers,
          'user-agent': FETCH_DEFAULTS.userAgent
        }
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        return { ok: false, error: { kind: 'FETCH_TIMEOUT' } };
      }
      return { ok: false, error: { kind: 'FETCH_NETWORK', message: String(e) } };
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) {
        return { ok: false, error: { kind: 'FETCH_HTTP_ERROR', status: res.status } };
      }
      try {
        target = new URL(loc, target);
      } catch {
        return blocked('scheme');
      }
      continue;
    }

    if (!res.ok) {
      return { ok: false, error: { kind: 'FETCH_HTTP_ERROR', status: res.status } };
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentTypeAllowed(contentType)) {
      return { ok: false, error: { kind: 'FETCH_UNSUPPORTED_CONTENT_TYPE', contentType } };
    }

    const { bytes, tooLarge } = await readWithSizeCap(res, FETCH_DEFAULTS.maxBytes);
    if (tooLarge) {
      return {
        ok: false,
        error: { kind: 'FETCH_TOO_LARGE', sizeBytes: FETCH_DEFAULTS.maxBytes + 1 }
      };
    }

    const html = decode(bytes, charsetFromContentType(contentType));
    return {
      ok: true,
      value: {
        html,
        contentType,
        finalUrl: target.toString(),
        byteSize: bytes.byteLength
      }
    };
  }

  return blocked('redirect_loop');
}
