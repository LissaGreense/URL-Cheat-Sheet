import { describe, expect, it } from 'vitest';
import { finalize } from '../src/tools/finalize.ts';

describe('finalize tool', () => {
  it('rejects empty answer via Zod', () => {
    const parsed = finalize.inputSchema.safeParse({ answer: '', citations: [] });
    expect(parsed.success).toBe(false);
  });

  it('accepts valid answer + citations', () => {
    const parsed = finalize.inputSchema.safeParse({ answer: 'hello', citations: ['L1'] });
    expect(parsed.success).toBe(true);
  });

  it('defaults citations to []', () => {
    const parsed = finalize.inputSchema.safeParse({ answer: 'hello' });
    expect(parsed.success && parsed.data.citations).toEqual([]);
  });

  it('description tells the model when to call it', () => {
    expect(finalize.description?.toLowerCase()).toContain('exactly once');
    expect(finalize.description?.toLowerCase()).toContain('empty');
  });
});
