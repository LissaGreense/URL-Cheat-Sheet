import { json, type RequestHandler } from '@sveltejs/kit';
import { APICallError, LoadAPIKeyError, type UIMessage } from 'ai';
import { streamChat } from '@url-cheat-sheet/agent';
import { chatRequestSchema } from '@url-cheat-sheet/schemas';

/**
 * Hard ceiling for /api/chat request bodies. A hostile or buggy client
 * that streams a multi-megabyte body would otherwise spend the user's
 * Anthropic quota in one call before the schema parse even runs. 1 MiB
 * is well above the legitimate ceiling for a Chat client payload (UI
 * messages + extracted-doc text capped earlier in the pipeline) and
 * leaves ample headroom for future fields.
 */
const MAX_CHAT_PAYLOAD_BYTES = 1024 * 1024;

/**
 * Chat endpoint. Validates the @ai-sdk/svelte Chat client body (now
 * including the per-request grounding document and the user-supplied
 * `apiKey`), then streams the model response back via the AI SDK's UI
 * message stream.
 *
 * The user's Anthropic key arrives in the request body, is bound to a
 * single local `const` in `parsed.data`, and is forwarded into
 * `streamChat` where the provider is constructed per-request. Nothing
 * about the key persists across handler invocations; see
 * `docs/specs/2026-05-20-byo-anthropic-key.md` § "Server-side
 * discipline".
 *
 * Errors thrown synchronously by `streamChat` (e.g., before any bytes
 * have flushed) are caught and mapped into shaped JSON responses below.
 * Mid-stream errors (after headers have flushed) surface as in-stream
 * `error` parts and are sanitised by the `onError` overrides on
 * `streamText` + `toUIMessageStreamResponse` inside `streamChat` —
 * those are NOT this handler's responsibility.
 *
 * Response shaping rules (must not leak the key or raw body):
 *   - `APICallError` 401 → 401 "API key rejected by provider"
 *   - `APICallError` 429 → 429 "Provider rate limit or quota exceeded"
 *   - `APICallError` other / undefined status → 502 "Upstream provider error"
 *   - `LoadAPIKeyError`        → 400 "API key missing or malformed"
 *   - Anything else            → rethrow (SvelteKit's default 500 path)
 *
 * No `console.*` call here may receive `parsed`, `parsed.data`, or any
 * object that transitively contains the body — that would route the
 * user's key into Vercel runtime logs (the only path by which it can
 * land there; Vercel does not log request bodies by default).
 */
export const POST: RequestHandler = async ({ request }) => {
  // Cheapest correct check: trust the advertised `content-length` and
  // reject before we ever touch `request.json()` (which would buffer the
  // whole body into memory). Absent or unparseable header → fall through
  // and let downstream parsing handle it; modern fetch clients always
  // set content-length on fixed-size bodies, and the schema parse below
  // bounds memory in the no-header case via SvelteKit's body limit.
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_CHAT_PAYLOAD_BYTES) {
      return json({ error: 'payload_too_large', limit: MAX_CHAT_PAYLOAD_BYTES }, { status: 413 });
    }
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Body must be valid JSON' }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
  }

  // Schema validates structure (id, role, parts: unknown[]); AI SDK
  // validates each part shape inside convertToModelMessages. One
  // boundary cast bridges the two type worlds.
  try {
    return await streamChat(
      parsed.data.messages as UIMessage[],
      parsed.data.document,
      parsed.data.apiKey,
      request.signal
    );
  } catch (err) {
    if (APICallError.isInstance(err)) {
      if (err.statusCode === 401) {
        return json({ error: 'API key rejected by provider' }, { status: 401 });
      }
      if (err.statusCode === 429) {
        return json({ error: 'Provider rate limit or quota exceeded' }, { status: 429 });
      }
      return json({ error: 'Upstream provider error' }, { status: 502 });
    }
    if (LoadAPIKeyError.isInstance(err)) {
      return json({ error: 'API key missing or malformed' }, { status: 400 });
    }
    // Anything we don't recognise: rethrow so SvelteKit's default
    // error handler turns it into a 500. We deliberately do NOT log
    // `err` here — its `responseBody` could carry the provider's
    // echoed request payload including the apiKey.
    throw err;
  }
};
