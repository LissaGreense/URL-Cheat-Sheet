import { describe, it, expect } from 'vitest';
import { grepLines } from '../src/tools/grep-rfc.ts';

const sample = [
  'line one', // L1
  'second line has coffee', // L2
  'third line plain', // L3
  'COFFEE in shouty caps', // L4
  'fifth line', // L5
  'sixth line plain', // L6
  'seventh line plain' // L7
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
    const matches = grepLines(sample, 'COFFEE');
    expect(matches.map((m) => m.line)).toEqual([2, 4]);
  });

  it('returns 2 lines of before/after context', () => {
    const [hit] = grepLines(sample, 'COFFEE in shouty');
    expect(hit.line).toBe(4);
    expect(hit.before).toEqual(['second line has coffee', 'third line plain']);
    expect(hit.after).toEqual(['fifth line', 'sixth line plain']);
  });

  it('clamps context at the start of the document', () => {
    const [hit] = grepLines(sample, 'line one');
    expect(hit.line).toBe(1);
    expect(hit.before).toEqual([]);
    expect(hit.after).toEqual(['second line has coffee', 'third line plain']);
  });

  it('clamps context at the end of the document', () => {
    const [hit] = grepLines(sample, 'seventh');
    expect(hit.line).toBe(7);
    expect(hit.before).toEqual(['fifth line', 'sixth line plain']);
    expect(hit.after).toEqual([]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(grepLines(sample, 'no-such-token')).toEqual([]);
  });

  it('caps results at 20 matches', () => {
    const dense = Array.from({ length: 50 }, (_, i) => `line ${i} coffee`).join('\n');
    const matches = grepLines(dense, 'coffee');
    expect(matches).toHaveLength(20);
    expect(matches[0].line).toBe(1);
    expect(matches[19].line).toBe(20);
  });
});
