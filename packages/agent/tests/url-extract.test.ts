import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractContent } from '../src/url/extract';

const fixture = (name: string) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('extractContent', () => {
  it('extracts article body and strips nav/footer', () => {
    const result = extractContent(fixture('sample-article.html'), 'https://news.example.com/cat');
    if ('kind' in result) throw new Error(`unexpected error: ${result.kind}`);
    expect(result.title).toContain('Cat');
    expect(result.text).toContain('first paragraph of the actual article body');
    expect(result.text).not.toContain('Home | News | Sports');
    expect(result.text).not.toContain('© 2026 Example News');
  });

  it('returns EMPTY_EXTRACTION on SPA shells', () => {
    const result = extractContent(fixture('spa-shell.html'), 'https://app.example.com/');
    expect('kind' in result && result.kind).toBe('EMPTY_EXTRACTION');
  });

  it('extracts RFC 2324 content (regression vs bundled doc)', () => {
    const result = extractContent(
      fixture('rfc2324.html'),
      'https://www.rfc-editor.org/rfc/rfc2324.html'
    );
    if ('kind' in result) throw new Error(`unexpected error: ${result.kind}`);
    expect(result.title).toMatch(/RFC 2324|Coffee Pot/);
    expect(result.text.toLowerCase()).toContain('hyper text coffee pot control protocol');
  });

  it('returns an error on near-empty body', () => {
    const result = extractContent('<html><head></head><body></body></html>', 'https://x.com/');
    expect(
      'kind' in result && (result.kind === 'EMPTY_EXTRACTION' || result.kind === 'PARSE_FAILED')
    ).toBe(true);
  });
});
