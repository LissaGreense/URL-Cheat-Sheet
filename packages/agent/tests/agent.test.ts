import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SYSTEM_PROMPT } from '../src/prompt.ts';
import { makeGrepDoc } from '../src/tools/grep-doc.ts';
import { streamChat } from '../src/agent.ts';
import { stepCountIs, streamText, type UIMessage } from 'ai';
import type { Document } from '@url-cheat-sheet/schemas';

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    stepCountIs: vi.fn(actual.stepCountIs),
    streamText: vi.fn(() => ({
      toUIMessageStreamResponse: () => new Response('')
    }))
  };
});

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

  it('budgets tool calls and reserves one for the final answer', () => {
    expect(SYSTEM_PROMPT).toMatch(/at most 8 tool calls/i);
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('never end a turn without text');
  });

  it('forbids empty answers and offers a graceful no-answer phrasing', () => {
    expect(SYSTEM_PROMPT).toMatch(/always produce a final answer/i);
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("i couldn't find this in the document");
  });

  it('requires exact Lxx citation format with no estimation', () => {
    expect(SYSTEM_PROMPT).toMatch(/exactly as returned by grep_doc/i);
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('do not estimate or round');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('uncited claims are forbidden');
  });
});

describe('streamChat', () => {
  beforeEach(() => {
    vi.mocked(streamText).mockClear();
    vi.mocked(stepCountIs).mockClear();
  });

  it('is callable (verified at type level)', () => {
    expect(typeof streamChat).toBe('function');
  });

  it('makeGrepDoc returns a tool with an inputSchema', () => {
    const t = makeGrepDoc('hello world');
    expect(t.inputSchema).toBeDefined();
  });

  it('passes temperature: 0 to streamText for grounded QA reproducibility', async () => {
    const messages: UIMessage[] = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }
    ];
    const document: Document = {
      text: 'hello world',
      title: 'doc',
      sourceUrl: 'https://example.com/doc'
    };

    await streamChat(messages, document);

    expect(vi.mocked(streamText)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(streamText).mock.calls[0]![0]!.temperature).toBe(0);
  });

  it('passes stopWhen: stepCountIs(8) to give the model headroom on tool-heavy questions', async () => {
    const messages: UIMessage[] = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }
    ];
    const document: Document = {
      text: 'hello world',
      title: 'doc',
      sourceUrl: 'https://example.com/doc'
    };

    await streamChat(messages, document);

    expect(vi.mocked(stepCountIs)).toHaveBeenCalledWith(8);
  });
});
