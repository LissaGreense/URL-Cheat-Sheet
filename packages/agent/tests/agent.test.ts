import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT } from '../src/prompt.ts';
import { makeGrepDoc } from '../src/tools/grep-doc.ts';
import { streamChat } from '../src/agent.ts';

describe('SYSTEM_PROMPT', () => {
  it('instructs the model to ground claims via grep_doc', () => {
    expect(SYSTEM_PROMPT).toMatch(/grep_doc/);
  });

  it('frames tool results as untrusted external data', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('untrusted');
    expect(SYSTEM_PROMPT.toLowerCase()).toMatch(/data, not.*instructions/);
  });

  it('instructs the model to cite line numbers and avoid markdown', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('line number');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('no markdown');
  });
});

describe('streamChat', () => {
  it('is callable (verified at type level)', () => {
    expect(typeof streamChat).toBe('function');
  });

  it('makeGrepDoc returns a tool with an inputSchema', () => {
    const t = makeGrepDoc('hello world');
    expect(t.inputSchema).toBeDefined();
  });
});
