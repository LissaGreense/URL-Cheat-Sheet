/**
 * @fileoverview Tests for the chat-error classifier (spec § Error
 * taxonomy, plan Task 5 § "Client-side error handling"). The four
 * Task 3 contract strings — copied verbatim from
 * `apps/web/src/routes/api/chat/+server.ts` — map to four buckets.
 *
 * If the server-side strings ever change, both the helper and these
 * tests must update.
 */
import { describe, it, expect } from 'vitest';
import { classifyChatError, INLINE_ERROR_COPY } from './chat-error';

describe('classifyChatError', () => {
  it('returns "key-rejected" when message contains the 401 contract string', () => {
    expect(classifyChatError('API key rejected by provider')).toBe('key-rejected');
  });

  it('matches the 401 string when wrapped in an AI SDK prefix', () => {
    // The @ai-sdk client throws an Error whose message embeds the JSON
    // response body; we only assert substring containment, which lets us
    // be resilient to whatever prefix the SDK adds.
    expect(
      classifyChatError('Failed to call API: 401 {"error":"API key rejected by provider"}')
    ).toBe('key-rejected');
  });

  it('returns "key-malformed" when message contains the 400 LoadAPIKeyError string', () => {
    expect(classifyChatError('API key missing or malformed')).toBe('key-malformed');
  });

  it('returns "rate-limit" when message contains the 429 contract string', () => {
    expect(classifyChatError('Provider rate limit or quota exceeded')).toBe('rate-limit');
  });

  it('returns "generic" when message contains the 502 upstream string', () => {
    // 'Upstream provider error' is also a Task 3 contract string but the
    // plan groups it with the generic bucket — same UX (inline message,
    // do not clear key).
    expect(classifyChatError('Upstream provider error')).toBe('generic');
  });

  it('returns "generic" for an unrecognised string', () => {
    expect(classifyChatError('Some other failure')).toBe('generic');
  });

  it('returns "generic" for undefined', () => {
    expect(classifyChatError(undefined)).toBe('generic');
  });

  it('returns "generic" for empty string', () => {
    expect(classifyChatError('')).toBe('generic');
  });
});

describe('INLINE_ERROR_COPY', () => {
  it('provides copy for the rate-limit bucket', () => {
    expect(INLINE_ERROR_COPY['rate-limit']).toContain('rate limit');
    expect(INLINE_ERROR_COPY['rate-limit']).toContain('Anthropic');
  });

  it('provides copy for the generic bucket', () => {
    expect(INLINE_ERROR_COPY.generic.length).toBeGreaterThan(0);
  });
});
