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

  /**
   * ucs-hoh: finalize must have an `execute` function so that
   * convertToModelMessages on the *next* turn sees a well-formed
   * tool-call → tool-result pair. Without it, every subsequent turn
   * after the first throws AI_MissingToolResultsError mid-stream.
   * stopWhen: hasToolCall('finalize') still halts the agent loop, so
   * adding execute does not change the single-turn behaviour.
   */
  it('has an execute function (ucs-hoh — required for multi-turn message validity)', () => {
    expect(finalize.execute).toBeDefined();
    expect(typeof finalize.execute).toBe('function');
  });

  it('execute echoes its input back so the tool result encodes the final answer', async () => {
    const input = { answer: 'the answer', citations: ['L1', 'L2'] };
    const result = await finalize.execute!(input, {} as never);
    expect(result).toEqual(input);
  });
});
