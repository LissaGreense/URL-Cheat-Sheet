import { describe, it, expect } from 'vitest';
import { chatRequestSchema, type ChatRequest } from '../src/chat.ts';

/**
 * Known-good request body fixture: a single user message, a valid
 * grounding document, and a non-empty apiKey. Reused across the
 * positive and negative cases below — individual tests mutate a
 * shallow copy to express the scenario under test.
 */
const VALID_BODY = {
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
  },
  apiKey: 'sk-ant-test-key'
};

describe('chatRequestSchema', () => {
  it('parses a known-good body with apiKey', () => {
    const result = chatRequestSchema.safeParse(VALID_BODY);
    expect(result.success).toBe(true);
  });

  it('rejects a body missing apiKey', () => {
    const { apiKey: _omit, ...withoutKey } = VALID_BODY;
    const result = chatRequestSchema.safeParse(withoutKey);
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
