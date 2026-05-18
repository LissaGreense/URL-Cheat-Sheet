import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT } from '../src/prompt.ts';
import { grepRfc } from '../src/tools/grep-rfc.ts';
import { streamChat } from '../src/agent.ts';

describe('SYSTEM_PROMPT', () => {
  it('instructs the model to ground every claim via grep_rfc', () => {
    expect(SYSTEM_PROMPT).toMatch(/grep_rfc/);
    expect(SYSTEM_PROMPT).toMatch(/RFC 2324/);
  });

  it('instructs the model to cite line numbers and avoid markdown', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('line number');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('no markdown');
  });
});

describe('streamChat', () => {
  it('is callable with an array of messages', () => {
    expect(typeof streamChat).toBe('function');
  });

  it('grepRfc tool is exported and has an inputSchema', () => {
    expect(grepRfc).toBeDefined();
    expect(grepRfc.inputSchema).toBeDefined();
  });
});
