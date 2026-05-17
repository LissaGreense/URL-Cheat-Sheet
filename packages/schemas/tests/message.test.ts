import { describe, it, expect } from 'vitest';
import { messageSchema, type Message } from '../src/message.ts';

describe('messageSchema', () => {
  it('accepts a valid user message', () => {
    const input = { role: 'user', content: 'hi' };
    const parsed = messageSchema.parse(input);
    expect(parsed).toEqual(input);
  });

  it('rejects unknown roles', () => {
    const result = messageSchema.safeParse({ role: 'wizard', content: 'hi' });
    expect(result.success).toBe(false);
  });

  it('rejects extra unknown properties (strict)', () => {
    const result = messageSchema.safeParse({
      role: 'user',
      content: 'hi',
      sneaky: true
    });
    expect(result.success).toBe(false);
  });

  it('inferred type matches schema', () => {
    const _typecheck: Message = { role: 'assistant', content: 'ok' };
    expect(_typecheck.role).toBe('assistant');
  });
});
