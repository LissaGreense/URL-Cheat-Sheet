import { describe, it, expect } from 'vitest';
import {
  threatSchema,
  scanResultSchema,
  documentSchema,
  headingSchema,
  extractRequestSchema,
  extractResponseSchema,
  extractErrorSchema
} from '../src/extract';

describe('threatSchema', () => {
  it('accepts a valid threat', () => {
    expect(() => threatSchema.parse({ type: 'instruction-override', severity: 0.9 })).not.toThrow();
  });

  it('rejects severity > 1', () => {
    expect(() => threatSchema.parse({ type: 'instruction-override', severity: 1.5 })).toThrow();
  });

  it('rejects severity < 0', () => {
    expect(() => threatSchema.parse({ type: 'instruction-override', severity: -0.1 })).toThrow();
  });

  it('rejects unknown threat type', () => {
    expect(() => threatSchema.parse({ type: 'mind-control', severity: 0.5 })).toThrow();
  });
});

describe('scanResultSchema', () => {
  it('accepts a clean (safe) scan', () => {
    expect(() => scanResultSchema.parse({ safe: true, threats: [] })).not.toThrow();
  });

  it('accepts a flagged scan with threats', () => {
    expect(() =>
      scanResultSchema.parse({
        safe: false,
        threats: [{ type: 'leak', severity: 0.7 }]
      })
    ).not.toThrow();
  });

  it('rejects missing safe field (strictObject)', () => {
    expect(() => scanResultSchema.parse({ threats: [] })).toThrow();
  });

  it('rejects extra fields (strictObject)', () => {
    expect(() => scanResultSchema.parse({ safe: true, threats: [], extra: 'nope' })).toThrow();
  });
});

describe('headingSchema', () => {
  it('accepts a valid heading', () => {
    expect(() => headingSchema.parse({ text: 'Intro', level: 1, line: 1 })).not.toThrow();
  });

  it('accepts levels 1 through 6', () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      expect(() => headingSchema.parse({ text: 'h', level, line: 1 })).not.toThrow();
    }
  });

  it('rejects level 0', () => {
    expect(() => headingSchema.parse({ text: 'h', level: 0, line: 1 })).toThrow();
  });

  it('rejects level 7', () => {
    expect(() => headingSchema.parse({ text: 'h', level: 7, line: 1 })).toThrow();
  });

  it('rejects empty text', () => {
    expect(() => headingSchema.parse({ text: '', level: 1, line: 1 })).toThrow();
  });

  it('rejects non-positive line', () => {
    expect(() => headingSchema.parse({ text: 'h', level: 1, line: 0 })).toThrow();
    expect(() => headingSchema.parse({ text: 'h', level: 1, line: -3 })).toThrow();
  });

  it('rejects non-integer line', () => {
    expect(() => headingSchema.parse({ text: 'h', level: 1, line: 1.5 })).toThrow();
  });
});

describe('documentSchema', () => {
  it('accepts a valid document with headings', () => {
    expect(() =>
      documentSchema.parse({
        text: 'hello',
        title: 'Hi',
        sourceUrl: 'https://example.com/',
        headings: [
          { text: 'Intro', level: 1, line: 1 },
          { text: 'Details', level: 2, line: 5 }
        ]
      })
    ).not.toThrow();
  });

  it('accepts a document with an empty headings array', () => {
    expect(() =>
      documentSchema.parse({
        text: 'hello',
        title: 'Hi',
        sourceUrl: 'https://example.com/',
        headings: []
      })
    ).not.toThrow();
  });

  it('rejects a document missing headings (required, no default)', () => {
    expect(() =>
      documentSchema.parse({
        text: 'hello',
        title: 'Hi',
        sourceUrl: 'https://example.com/'
      })
    ).toThrow();
  });

  it('rejects non-URL sourceUrl', () => {
    expect(() =>
      documentSchema.parse({ text: '', title: '', sourceUrl: 'not a url', headings: [] })
    ).toThrow();
  });

  it('rejects an invalid heading inside headings', () => {
    expect(() =>
      documentSchema.parse({
        text: 'hello',
        title: 'Hi',
        sourceUrl: 'https://example.com/',
        headings: [{ text: 'bad', level: 9, line: 1 }]
      })
    ).toThrow();
  });
});

describe('extractRequestSchema', () => {
  it('rejects extra fields (strictObject)', () => {
    expect(() => extractRequestSchema.parse({ url: 'https://x.com/', extra: 'nope' })).toThrow();
  });
});

describe('extractResponseSchema', () => {
  it('accepts a clean response', () => {
    expect(() =>
      extractResponseSchema.parse({
        text: 'doc',
        title: 'Title',
        sourceUrl: 'https://example.com/',
        headings: [],
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
        headings: [{ text: 'Intro', level: 1, line: 1 }],
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
      expect(() => extractErrorSchema.parse({ kind, message: 'm' })).not.toThrow();
    }
  });
});
