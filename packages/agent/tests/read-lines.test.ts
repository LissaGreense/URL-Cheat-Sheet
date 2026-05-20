import { describe, it, expect } from 'vitest';
import { makeReadLines } from '../src/tools/read-lines';

const tenLineDoc = Array.from({ length: 10 }, (_, i) => `content ${i + 1}`).join('\n');
const thousandLineDoc = Array.from({ length: 1000 }, (_, i) => `content ${i + 1}`).join('\n');

describe('makeReadLines', () => {
  it('returns requested lines prefixed with Lxx | and joined by newlines (happy path)', async () => {
    const t = makeReadLines(tenLineDoc);
    const result = (await t.execute!({ start: 3, end: 5 }, {} as never)) as {
      text: string;
      truncated: boolean;
    };
    expect(result).toEqual({
      text: 'L3 | content 3\nL4 | content 4\nL5 | content 5',
      truncated: false
    });
  });

  it('clamps a negative start up to 1', async () => {
    const t = makeReadLines(tenLineDoc);
    const result = (await t.execute!({ start: -5, end: 2 }, {} as never)) as {
      text: string;
      truncated: boolean;
    };
    expect(result).toEqual({
      text: 'L1 | content 1\nL2 | content 2',
      truncated: false
    });
  });

  it('clamps an end beyond document length down to lineCount', async () => {
    const t = makeReadLines(tenLineDoc);
    const result = (await t.execute!({ start: 8, end: 9999 }, {} as never)) as {
      text: string;
      truncated: boolean;
    };
    expect(result).toEqual({
      text: 'L8 | content 8\nL9 | content 9\nL10 | content 10',
      truncated: false
    });
  });

  it('returns empty text when start is past end of document', async () => {
    const t = makeReadLines(tenLineDoc);
    const result = (await t.execute!({ start: 50, end: 60 }, {} as never)) as {
      text: string;
      truncated: boolean;
    };
    expect(result).toEqual({ text: '', truncated: false });
  });

  it('returns empty text when start > end after clamping (inverted range)', async () => {
    const t = makeReadLines(tenLineDoc);
    const result = (await t.execute!({ start: 5, end: 2 }, {} as never)) as {
      text: string;
      truncated: boolean;
    };
    expect(result).toEqual({ text: '', truncated: false });
  });

  it('truncates ranges larger than MAX_LINES (200) and flags truncated=true', async () => {
    const t = makeReadLines(thousandLineDoc);
    const result = (await t.execute!({ start: 1, end: 500 }, {} as never)) as {
      text: string;
      truncated: boolean;
    };
    const lines = result.text.split('\n');
    expect(lines).toHaveLength(200);
    expect(lines[0]).toBe('L1 | content 1');
    expect(lines[199]).toBe('L200 | content 200');
    expect(result.truncated).toBe(true);
  });

  it('does not flag truncated when the range is exactly MAX_LINES (200)', async () => {
    const t = makeReadLines(thousandLineDoc);
    const result = (await t.execute!({ start: 1, end: 200 }, {} as never)) as {
      text: string;
      truncated: boolean;
    };
    const lines = result.text.split('\n');
    expect(lines).toHaveLength(200);
    expect(lines[0]).toBe('L1 | content 1');
    expect(lines[199]).toBe('L200 | content 200');
    expect(result.truncated).toBe(false);
  });
});
