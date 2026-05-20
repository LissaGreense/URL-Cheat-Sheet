import { describe, it, expect } from 'vitest';
import { chatRequestSchema, type ChatRequest } from '../src/chat.ts';

/**
 * Body shape WITHOUT apiKey — used directly in the "rejects when
 * missing" test, and spread into `VALID_BODY` for every positive
 * case. Constructed this way (rather than destructuring `apiKey`
 * out of a full fixture) so no `eslint-disable` is needed for an
 * unused destructure binding.
 */
const BODY_WITHOUT_API_KEY = {
  messages: [
    {
      id: 'm1',
      role: 'user' as const,
      parts: [{ type: 'text', text: 'hello' }]
    }
  ],
  document: {
    text: 'doc body',
    title: 'Doc',
    sourceUrl: 'https://example.com/',
    headings: []
  }
};

const VALID_BODY = { ...BODY_WITHOUT_API_KEY, apiKey: 'sk-ant-test-key' };

describe('chatRequestSchema', () => {
  it('parses a known-good body with apiKey', () => {
    const result = chatRequestSchema.safeParse(VALID_BODY);
    expect(result.success).toBe(true);
  });

  it('rejects a body missing apiKey', () => {
    const result = chatRequestSchema.safeParse(BODY_WITHOUT_API_KEY);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects a body with an empty-string apiKey', () => {
    const result = chatRequestSchema.safeParse({ ...VALID_BODY, apiKey: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects a body with a non-string apiKey', () => {
    const result = chatRequestSchema.safeParse({ ...VALID_BODY, apiKey: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('inferred ChatRequest type includes apiKey', () => {
    const _typecheck: ChatRequest = VALID_BODY;
    expect(_typecheck.apiKey).toBe('sk-ant-test-key');
  });
});
