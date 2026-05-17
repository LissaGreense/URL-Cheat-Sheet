import { describe, it, expect } from 'vitest';
import { parseCase } from '../src/case-loader.ts';

describe('parseCase', () => {
  it('parses a minimal valid case', () => {
    const raw = {
      name: 'smoke',
      steps: [{ action: 'navigate', target: '/' }],
      assertions: ['page loads']
    };
    const parsed = parseCase(raw);
    expect(parsed.name).toBe('smoke');
    expect(parsed.setup).toEqual([]);
    expect(parsed.dataDependencies).toEqual([]);
  });

  it('rejects a case with no assertions', () => {
    const raw = {
      name: 'bad',
      steps: [{ action: 'navigate', target: '/' }],
      assertions: []
    };
    expect(() => parseCase(raw)).toThrow();
  });
});
