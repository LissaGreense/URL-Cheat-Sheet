import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  extractRequestSchema,
  type ExtractError,
  type ExtractResponse
} from '@url-cheat-sheet/schemas';
import { safeFetch, extractContent, vardScanner } from '@url-cheat-sheet/agent';

/**
 * Map an `ExtractError['kind']` to the appropriate HTTP status code.
 *
 * - Network/timeout failures upstream → 504 Gateway Timeout
 * - Oversize payloads → 413 Payload Too Large
 * - Blocked/unsupported/empty/parse failures → 400 Bad Request
 * - Non-2xx upstream HTTP responses → 502 Bad Gateway
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
  }
}

function errorBody(kind: ExtractError['kind'], message: string): ExtractError {
  return { kind, message };
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

  const fetchResult = await safeFetch(parsed.data.url);
  if (!fetchResult.ok) {
    return json(errorBody(fetchResult.error.kind, fetchResult.error.kind), {
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
    byteSize: extractResult.text.length,
    scan
  };
  return json(response, { status: 200 });
};
