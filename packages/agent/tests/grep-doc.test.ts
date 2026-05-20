import { describe, it, expect } from 'vitest';
import { grepLines, makeGrepDoc } from '../src/tools/grep-doc';

const sample = [
  'line one',
  'second line has coffee',
  'third line plain',
  'COFFEE in shouty caps',
  'fifth line',
  'sixth line plain',
  'seventh line plain'
].join('\n');

describe('grepLines', () => {
  it('returns one match per hit with 1-based line numbers', () => {
    const matches = grepLines(sample, 'coffee');
    expect(matches).toHaveLength(2);
    expect(matches[0].line).toBe(2);
    expect(matches[0].text).toBe('second line has coffee');
    expect(matches[1].line).toBe(4);
  });

  it('is case-insensitive', () => {
    expect(grepLines(sample, 'COFFEE').map((m) => m.line)).toEqual([2, 4]);
  });

  it('returns 2 lines of before/after context', () => {
    const [hit] = grepLines(sample, 'COFFEE in shouty');
    expect(hit.line).toBe(4);
    expect(hit.before).toEqual(['second line has coffee', 'third line plain']);
    expect(hit.after).toEqual(['fifth line', 'sixth line plain']);
  });

  it('clamps context at the start of the document', () => {
    const [hit] = grepLines(sample, 'line one');
    expect(hit.before).toEqual([]);
  });

  it('clamps context at the end of the document', () => {
    const [hit] = grepLines(sample, 'seventh');
    expect(hit.after).toEqual([]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(grepLines(sample, 'no-such-token')).toEqual([]);
  });

  it('caps results at 20 matches', () => {
    const dense = Array.from({ length: 50 }, (_, i) => `line ${i} coffee`).join('\n');
    const matches = grepLines(dense, 'coffee');
    expect(matches).toHaveLength(20);
  });

  it('handles empty document', () => {
    expect(grepLines('', 'anything')).toEqual([]);
  });

  it('splits a pipe-separated pattern and OR-unions the matches (ucs-8nl)', () => {
    // sample has 'coffee' at L2 and 'COFFEE' at L4; 'seventh' only at L7.
    // OR union should hit lines 2, 4, AND 7 in one call.
    const matches = grepLines(sample, 'coffee|seventh');
    expect(matches.map((m) => m.line)).toEqual([2, 4, 7]);
  });

  it('trims whitespace around each pipe-separated alternative', () => {
    // The wild-caught regression from ucs-8nl: model emitted
    // `"HTTP status | status code | 4xx | 5xx | 2xx | 200 | 404 | 500"`
    // with spaces around `|`. Spaces must NOT bleed into the needle.
    const httpDoc = ['Some preamble here.', 'HTTP status code 200 means OK', 'Other text'].join(
      '\n'
    );
    const matches = grepLines(
      httpDoc,
      'HTTP status | status code | 4xx | 5xx | 2xx | 200 | 404 | 500'
    );
    expect(matches.map((m) => m.line)).toEqual([2]);
  });

  it('returns empty when no pipe-alternative hits', () => {
    expect(grepLines(sample, 'matcha|sencha|hojicha')).toEqual([]);
  });

  it('applies the 20-match cap across the pipe-union, not per alternative', () => {
    const dense = Array.from({ length: 50 }, (_, i) => `line ${i} coffee`).join('\n');
    // Both alternatives hit every line, but cap is 20 across the union.
    const matches = grepLines(dense, 'coffee|line');
    expect(matches).toHaveLength(20);
  });

  it('drops empty alternatives from leading/trailing/consecutive pipes', () => {
    const matches = grepLines(sample, '|coffee||seventh|');
    expect(matches.map((m) => m.line)).toEqual([2, 4, 7]);
  });

  it('returns empty when the pattern is only pipes/whitespace', () => {
    expect(grepLines(sample, '|||')).toEqual([]);
    expect(grepLines(sample, ' | | ')).toEqual([]);
  });

  it('silently caps to the first 10 alternatives', () => {
    // 11 alternatives — only the first 10 are considered. The first 10 are
    // sentinels that don't appear in `sample`; the 11th ('line') would
    // otherwise hit every row. No matches confirms the 11th was dropped.
    const eleven = [
      'zz1',
      'zz2',
      'zz3',
      'zz4',
      'zz5',
      'zz6',
      'zz7',
      'zz8',
      'zz9',
      'zz10',
      'line'
    ].join('|');
    expect(grepLines(sample, eleven)).toEqual([]);
  });
});

describe('makeGrepDoc tool description', () => {
  it('steers query phrasing toward distinctive substrings', () => {
    const t = makeGrepDoc('any doc text');
    expect(t.description).toMatch(/short distinctive substrings/i);
  });

  it('documents empty-match handling and refusal behavior', () => {
    const t = makeGrepDoc('any doc text');
    expect(t.description!.toLowerCase()).toContain('empty results');
    expect(t.description!.toLowerCase()).toContain('not covered');
  });

  it('documents the pipe-alternation form for synonym exploration (ucs-8nl)', () => {
    const t = makeGrepDoc('any doc text');
    expect(t.description).toMatch(/\|/);
    expect(t.description!.toLowerCase()).toContain('synonyms');
    expect(t.description!.toLowerCase()).toContain('alternatives');
  });
});
