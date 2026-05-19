import { describe, it, expect } from 'vitest';
import {
  threatSchema,
  scanResultSchema,
  documentSchema,
  extractRequestSchema,
  extractResponseSchema,
  extractErrorSchema
} from '../src/extract';

describe('threatSchema', () => {
  it('accepts a valid threat', () => {
    expect(() =>
      threatSchema.parse({ type: 'instruction-override', severity: 0.9 })
    ).not.toThrow();
  });

  it('rejects severity > 1', () => {
    expect(() =>
      threatSchema.parse({ type: 'instruction-override', severity: 1.5 })
    ).toThrow();
  });

  it('rejects unknown threat type', () => {
    expect(() =>
      threatSchema.parse({ type: 'mind-control', severity: 0.5 })
    ).toThrow();
  });
});

describe('documentSchema', () => {
  it('accepts a valid document', () => {
    expect(() =>
      documentSchema.parse({
        text: 'hello',
        title: 'Hi',
        sourceUrl: 'https://example.com/'
      })
    ).not.toThrow();
  });

  it('rejects non-URL sourceUrl', () => {
    expect(() =>
      documentSchema.parse({ text: '', title: '', sourceUrl: 'not a url' })
    ).toThrow();
  });
});

describe('extractRequestSchema', () => {
  it('rejects extra fields (strictObject)', () => {
    expect(() =>
      extractRequestSchema.parse({ url: 'https://x.com/', extra: 'nope' })
    ).toThrow();
  });
});

describe('extractResponseSchema', () => {
  it('accepts a clean response', () => {
    expect(() =>
      extractResponseSchema.parse({
        text: 'doc',
        title: 'Title',
        sourceUrl: 'https://example.com/',
        byteSize: 3,
        scan: { safe: true, threats: [] }
      })
    ).not.toThrow();
  });

  it('accepts a flagged response', () => {
    expect(() =>
      extractResponseSchema.parse({
        text: 'doc',
        title: 'Title',
        sourceUrl: 'https://example.com/',
        byteSize: 3,
        scan: {
          safe: false,
          threats: [{ type: 'instruction-override', severity: 0.9 }]
        }
      })
    ).not.toThrow();
  });
});

describe('extractErrorSchema', () => {
  it('accepts all error kinds', () => {
    for (const kind of [
      'FETCH_TIMEOUT',
      'FETCH_TOO_LARGE',
      'FETCH_BLOCKED_URL',
      'FETCH_UNSUPPORTED_CONTENT_TYPE',
      'FETCH_HTTP_ERROR',
      'FETCH_NETWORK',
      'EMPTY_EXTRACTION',
      'PARSE_FAILED'
    ] as const) {
      expect(() =>
        extractErrorSchema.parse({ kind, message: 'm' })
      ).not.toThrow();
    }
  });
});
