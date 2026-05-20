import { describe, it, expect } from 'vitest';
import type { Heading } from '@url-cheat-sheet/schemas';
import { makeOutline } from '../src/tools/outline';

describe('makeOutline tool execute', () => {
  it('returns the headings array verbatim in order', async () => {
    const headings: Heading[] = [
      { text: 'A', level: 1, line: 10 },
      { text: 'B', level: 2, line: 25 }
    ];
    const t = makeOutline('any doc text', headings);
    const result = await t.execute!({}, {} as never);
    expect(result).toEqual({ headings });
  });

  it('returns an empty array when no headings exist (not an error)', async () => {
    const t = makeOutline('any doc text', []);
    const result = await t.execute!({}, {} as never);
    expect(result).toEqual({ headings: [] });
  });
});

describe('makeOutline tool description', () => {
  it('mentions heading structure to steer model usage', () => {
    const t = makeOutline('any doc text', []);
    expect(t.description).toMatch(/heading/i);
    expect(t.description).toMatch(/structure/i);
  });
});
