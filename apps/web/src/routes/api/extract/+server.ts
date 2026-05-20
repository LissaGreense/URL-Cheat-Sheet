import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  extractRequestSchema,
  type ExtractError,
  type ExtractResponse
} from '@url-cheat-sheet/schemas';
import { safeFetch, extractContent, vardScanner, type FetchFailure } from '@url-cheat-sheet/agent';

/**
 * Map an `ExtractError['kind']` to the appropriate HTTP status code.
 *
 * - Network/timeout failures upstream → 504 Gateway Timeout
 * - Oversize payloads → 413 Payload Too Large
 * - Blocked/unsupported/empty/parse failures → 400 Bad Request
 * - Non-2xx upstream HTTP responses → 502 Bad Gateway
 * - Unhandled internal exception → 500 Internal Server Error
 */
function errorStatus(kind: ExtractError['kind']): number {
  switch (kind) {
    case 'FETCH_TIMEOUT':
    case 'FETCH_NETWORK':
      return 504;
    case 'FETCH_TOO_LARGE':
      return 413;
    case 'FETCH_BLOCKED_URL':
    case 'FETCH_UNSUPPORTED_CONTENT_TYPE':
    case 'EMPTY_EXTRACTION':
    case 'PARSE_FAILED':
      return 400;
    case 'FETCH_HTTP_ERROR':
      return 502;
    case 'INTERNAL_ERROR':
      return 500;
  }
}

function errorBody(kind: ExtractError['kind'], message: string): ExtractError {
  return { kind, message };
}

/**
 * Build a human-meaningful message from a `safeFetch` failure. Each variant
 * carries different context, so the message is shaped per kind rather than
 * defaulting to the kind string (which makes the failure invisible to the
 * client; see ucs-u47).
 */
function fetchErrorMessage(error: FetchFailure['error']): string {
  switch (error.kind) {
    case 'FETCH_TIMEOUT':
      return 'request timed out';
    case 'FETCH_TOO_LARGE':
      return `response exceeded ${error.sizeBytes} bytes`;
    case 'FETCH_BLOCKED_URL':
      return `URL blocked: ${error.reason}`;
    case 'FETCH_UNSUPPORTED_CONTENT_TYPE':
      return `unsupported content type: ${error.contentType}`;
    case 'FETCH_HTTP_ERROR':
      return `HTTP ${error.status} from origin`;
    case 'FETCH_NETWORK':
      return error.message;
  }
}

/**
 * POST /api/extract — pipes a URL through the URL fetcher pipeline:
 * `safeFetch` (SSRF + size + content-type guards) → `extractContent`
 * (Readability) → `vardScanner` (prompt-injection scan). Returns a
 * typed `ExtractResponse` on success, a typed `ExtractError` body with
 * an appropriate HTTP status on failure.
 */
export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(errorBody('PARSE_FAILED', 'invalid JSON body'), { status: 400 });
  }

  const parsed = extractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(errorBody('PARSE_FAILED', 'invalid request shape'), { status: 400 });
  }

  // Defense-in-depth (ucs-tz0). The pipeline below has known typed
  // failure modes that each return a structured error above, but
  // anything that throws — Readability on pathological HTML, ipaddr
  // parsing edge cases, DNS resolver hiccups on Bun cold start, an
  // unexpected vard regression — would otherwise fall through to
  // SvelteKit's default error path and Vercel would serve a bare 502
  // with no body. Wrapping the whole pipeline turns every uncaught
  // exception into a typed INTERNAL_ERROR (500) and logs the error
  // class so the next reproduction is debuggable without a redeploy.
  try {
    const fetchResult = await safeFetch(parsed.data.url);
    if (!fetchResult.ok) {
      return json(errorBody(fetchResult.error.kind, fetchErrorMessage(fetchResult.error)), {
        status: errorStatus(fetchResult.error.kind)
      });
    }

    const extractResult = extractContent(fetchResult.value.html, fetchResult.value.finalUrl);
    if ('kind' in extractResult) {
      return json(errorBody(extractResult.kind, extractResult.kind), {
        status: errorStatus(extractResult.kind)
      });
    }

    const scan = await vardScanner.scan(extractResult.text);

    const response: ExtractResponse = {
      text: extractResult.text,
      title: extractResult.title,
      sourceUrl: fetchResult.value.finalUrl,
      headings: extractResult.headings,
      byteSize: extractResult.text.length,
      scan
    };
    return json(response, { status: 200 });
  } catch (err) {
    // Log a redacted summary (class + name). NEVER log `err` directly:
    // it may carry the URL the user typed inside an Error.cause chain,
    // and a future change might route the body through here. The
    // exception class is what we actually need for post-mortem.
    const errorClass = err instanceof Error ? err.constructor.name : typeof err;
    const errorName = err instanceof Error ? err.name : 'unknown';
    console.error({ kind: 'extract.unhandled', errorClass, errorName });
    return json(errorBody('INTERNAL_ERROR', 'Internal server error during extraction.'), {
      status: errorStatus('INTERNAL_ERROR')
    });
  }
};
