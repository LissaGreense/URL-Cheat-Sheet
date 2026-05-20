import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractContent, extractHeadings } from '../src/url/extract';

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

  it('attaches headings as a typed sidecar (array on every ExtractResult)', () => {
    // Even on a fixture where Readability strips the title-h1 (which it does
    // for sample-article.html — Readability removes a heading that matches
    // the page title heuristic), `headings` must still be an array (possibly
    // empty), and `text` is unchanged byte-for-byte from the pre-sidecar
    // implementation.
    const result = extractContent(fixture('sample-article.html'), 'https://news.example.com/cat');
    if ('kind' in result) throw new Error(`unexpected error: ${result.kind}`);

    expect(Array.isArray(result.headings)).toBe(true);
    const lineCount = result.text.split('\n').length;
    for (const h of result.headings) {
      expect(h.line).toBeGreaterThanOrEqual(1);
      expect(h.line).toBeLessThanOrEqual(lineCount);
      expect(h.level).toBeGreaterThanOrEqual(1);
      expect(h.level).toBeLessThanOrEqual(6);
    }
  });

  it('byte-identical text baseline: heading sidecar does not mutate text', () => {
    // Frozen text expectation for sample-article.html. Every existing Lxx
    // citation in the corpus depends on this output being stable. If this
    // test fails, the heading sidecar mutated text — STOP and investigate.
    const result = extractContent(fixture('sample-article.html'), 'https://news.example.com/cat');
    if ('kind' in result) throw new Error(`unexpected error: ${result.kind}`);

    const expected =
      'This is the first paragraph of the actual article body. It is long enough to clear the\n' +
      '        MIN_VIABLE_EXTRACTION threshold and should be preserved by Readability while the surrounding\n' +
      '        nav and footer get stripped. Readability identifies dense paragraph content and keeps it.\n' +
      '      \n      \n' +
      '        A second paragraph provides additional bulk so the extraction scores comfortably above the\n' +
      '        threshold.';

    expect(result.text).toBe(expected);
  });

  it('extracts headings from an RFC-style fixture with multiple headings', () => {
    // RFC 2324 has structured headings that Readability preserves (they're
    // not the page-title h1 it strips). Validate that the sidecar resolves
    // them to plausible line numbers.
    const result = extractContent(
      fixture('rfc2324.html'),
      'https://www.rfc-editor.org/rfc/rfc2324.html'
    );
    if ('kind' in result) throw new Error(`unexpected error: ${result.kind}`);

    // Don't pin exact count (Readability heuristics evolve); pin invariants.
    expect(Array.isArray(result.headings)).toBe(true);
    const lineCount = result.text.split('\n').length;
    for (const h of result.headings) {
      expect(h.line).toBeGreaterThanOrEqual(1);
      expect(h.line).toBeLessThanOrEqual(lineCount);
      expect(h.text.length).toBeGreaterThan(0);
      expect(h.level).toBeGreaterThanOrEqual(1);
      expect(h.level).toBeLessThanOrEqual(6);
    }
    // Headings must appear in strictly non-decreasing line order (cursor
    // invariant).
    for (let i = 1; i < result.headings.length; i++) {
      expect(result.headings[i]!.line).toBeGreaterThanOrEqual(result.headings[i - 1]!.line);
    }
  });
});

describe('extractHeadings', () => {
  it('returns all heading levels in document order', () => {
    const html = `<html><body>
      <h1>Title One</h1>
      <p>body line for title one</p>
      <h2>Section A</h2>
      <p>body line for section a</p>
      <h2>Section B</h2>
      <p>body line for section b</p>
      <h3>Sub A</h3>
      <p>body line for sub a</p>
      <h3>Sub B</h3>
      <p>body line for sub b</p>
      <h3>Sub C</h3>
      <p>body line for sub c</p>
    </body></html>`;
    const textContent = [
      'Title One',
      'body line for title one',
      'Section A',
      'body line for section a',
      'Section B',
      'body line for section b',
      'Sub A',
      'body line for sub a',
      'Sub B',
      'body line for sub b',
      'Sub C',
      'body line for sub c'
    ].join('\n');

    const headings = extractHeadings(html, textContent);

    expect(headings.length).toBe(6);
    expect(headings.map((h) => h.level)).toEqual([1, 2, 2, 3, 3, 3]);
    expect(headings.map((h) => h.text)).toEqual([
      'Title One',
      'Section A',
      'Section B',
      'Sub A',
      'Sub B',
      'Sub C'
    ]);
    const lineCount = textContent.split('\n').length;
    for (const h of headings) {
      expect(h.line).toBeGreaterThanOrEqual(1);
      expect(h.line).toBeLessThanOrEqual(lineCount);
    }
  });

  it('returns an empty array when no heading elements are present', () => {
    const html = '<html><body><p>just a paragraph</p><p>and another</p></body></html>';
    const textContent = 'just a paragraph\nand another';
    expect(extractHeadings(html, textContent)).toEqual([]);
  });

  it('matches headings whose text has mangled whitespace in textContent', () => {
    // The heading element's textContent has internal newlines/extra spaces;
    // the body line collapses them differently. Normalization (collapse
    // whitespace runs to single space, trim, lowercase) makes the match work.
    const html = `<html><body>
      <h2>  Introduction\n   to   Things  </h2>
      <p>Introduction to Things appears as one line in body text</p>
    </body></html>`;
    const textContent = ['Introduction to Things', 'body paragraph here'].join('\n');

    const headings = extractHeadings(html, textContent);

    expect(headings.length).toBe(1);
    expect(headings[0]!.level).toBe(2);
    expect(headings[0]!.line).toBe(1);
  });

  it('uses cursor invariant: first match after cursor wins for repeated heading text', () => {
    // Same heading text "Notes" appears twice. The first h2 consumes line 1
    // (cursor → 2). The second h2 then resolves to the next line containing
    // "notes" — which is line 3 ("Notes" standalone), not the earlier match.
    // (Body lines between intentionally avoid the word "notes" so the test
    // pinpoints the second-occurrence-attribution behavior, not the
    // `includes`-substring behavior.)
    const html = `<html><body>
      <h2>Notes</h2>
      <p>first body</p>
      <h2>Notes</h2>
      <p>second body</p>
    </body></html>`;
    const textContent = ['Notes', 'first body', 'Notes', 'second body'].join('\n');

    const headings = extractHeadings(html, textContent);

    expect(headings.length).toBe(2);
    expect(headings[0]!.line).toBe(1);
    expect(headings[1]!.line).toBe(3);
  });

  it('cursor invariant: heading found at actual position when text appears earlier in body', () => {
    // The h2 "Topic" text appears at line 1 (consumed by h1 "Intro Topic"
    // via the `includes` match), then later as a literal heading line.
    // Cursor invariance means h1 consumes its line (1), advances the
    // cursor past it, and the second heading "Topic" is then found at its
    // actual heading line later — NOT mis-attributed to line 1.
    const html = `<html><body>
      <h1>Intro Topic</h1>
      <p>some body content</p>
      <h2>Topic</h2>
      <p>topic body</p>
    </body></html>`;
    const textContent = ['Intro Topic', 'some body content', 'Topic', 'topic body'].join('\n');

    const headings = extractHeadings(html, textContent);

    // h1 "Intro Topic" matches line 1 (cursor → 2).
    // Even though line 1 also contains "topic" (a substring of "intro topic"),
    // the cursor has moved past it, so the h2 "Topic" lands at line 3.
    expect(headings.length).toBe(2);
    expect(headings[0]!.line).toBe(1);
    expect(headings[1]!.line).toBe(3);
  });
});
