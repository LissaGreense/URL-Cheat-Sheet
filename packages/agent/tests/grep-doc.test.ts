import { describe, it, expect } from 'vitest';
import { grepLines } from '../src/tools/grep-doc';

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

  it('accepts an array of patterns and OR-unions the matches (ucs-0f3)', () => {
    // sample has 'coffee' at L2 and 'COFFEE' at L4; 'seventh' only at L7.
    // OR union should hit lines 2, 4, AND 7 in one call — what previously
    // required 2 separate calls for { coffee, seventh }.
    const matches = grepLines(sample, ['coffee', 'seventh']);
    expect(matches.map((m) => m.line)).toEqual([2, 4, 7]);
  });

  it('OR with single-item array matches single-string behavior', () => {
    const singleStr = grepLines(sample, 'coffee').map((m) => m.line);
    const singleArr = grepLines(sample, ['coffee']).map((m) => m.line);
    expect(singleArr).toEqual(singleStr);
  });

  it('OR returns empty when no pattern hits', () => {
    expect(grepLines(sample, ['matcha', 'sencha', 'hojicha'])).toEqual([]);
  });

  it('OR applies the 20-match cap across the union, not per pattern', () => {
    const dense = Array.from({ length: 50 }, (_, i) => `line ${i} coffee`).join('\n');
    // Both patterns hit every line, but cap is 20 across the union.
    const matches = grepLines(dense, ['coffee', 'line']);
    expect(matches).toHaveLength(20);
  });

  it('OR with empty array returns empty matches (defensive — schema also rejects)', () => {
    expect(grepLines(sample, [])).toEqual([]);
  });
});

import { makeGrepDoc } from '../src/tools/grep-doc';

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

  it('documents the OR/array form for synonym exploration (ucs-0f3)', () => {
    const t = makeGrepDoc('any doc text');
    expect(t.description!.toLowerCase()).toMatch(/array of strings/);
    expect(t.description!.toLowerCase()).toContain('synonyms');
  });
});
