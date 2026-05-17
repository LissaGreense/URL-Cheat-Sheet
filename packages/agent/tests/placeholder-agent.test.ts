import { describe, it, expect } from 'vitest';
import { describeAgent } from '../src/placeholder-agent.ts';

describe('placeholder agent', () => {
  it('returns a stable self-description', () => {
    const info = describeAgent();
    expect(info.name).toBe('url-cheat-sheet-agent');
    expect(info.version).toBe('0.0.0');
    expect(info.tools).toEqual([]);
  });
});
