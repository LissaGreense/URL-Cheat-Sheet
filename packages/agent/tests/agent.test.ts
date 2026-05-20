import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SYSTEM_PROMPT } from '../src/prompt.ts';
import { makeGrepDoc } from '../src/tools/grep-doc.ts';
import { streamChat } from '../src/agent.ts';
import { stepCountIs, streamText, type UIMessage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { Document } from '@url-cheat-sheet/schemas';

const toUIMessageStreamResponseMock = vi.fn(() => new Response(''));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    stepCountIs: vi.fn(actual.stepCountIs),
    streamText: vi.fn(() => ({
      toUIMessageStreamResponse: (...args: unknown[]) => toUIMessageStreamResponseMock(...args)
    }))
  };
});

/**
 * The `createAnthropic` factory is mocked so tests can intercept the apiKey
 * that `streamChat` threads in. The returned "provider" is just a function
 * that ignores its model-id argument and returns a sentinel — `streamText`
 * is itself mocked, so it never tries to introspect the model shape.
 */
const fakeModelSentinel = { __fake: 'model' };
vi.mock('@ai-sdk/anthropic', async () => {
  const actual = await vi.importActual<typeof import('@ai-sdk/anthropic')>('@ai-sdk/anthropic');
  return {
    ...actual,
    createAnthropic: vi.fn(() => () => fakeModelSentinel)
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

  it('instructs the model to call finalize at the end of every turn', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('finalize');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('end every turn');
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

  it('teaches strict refusal-with-citation', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('must cite at least one');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('does not cover');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('outline()');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('read_lines');
  });
});

describe('streamChat', () => {
  const messages: UIMessage[] = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }];
  const document: Document = {
    text: 'hello world',
    title: 'doc',
    sourceUrl: 'https://example.com/doc',
    headings: []
  };
  const apiKey = 'sk-ant-test';

  beforeEach(() => {
    vi.mocked(streamText).mockClear();
    vi.mocked(stepCountIs).mockClear();
    vi.mocked(createAnthropic).mockClear();
    toUIMessageStreamResponseMock.mockClear();
  });

  it('is callable (verified at type level)', () => {
    expect(typeof streamChat).toBe('function');
  });

  it('makeGrepDoc returns a tool with an inputSchema', () => {
    const t = makeGrepDoc('hello world');
    expect(t.inputSchema).toBeDefined();
  });

  it('passes temperature: 0 to streamText for grounded QA reproducibility', async () => {
    await streamChat(messages, document, apiKey);

    expect(vi.mocked(streamText)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(streamText).mock.calls[0]![0]!.temperature).toBe(0);
  });

  it('registers both grep_doc and finalize tools', async () => {
    await streamChat(messages, document, apiKey);

    const tools = vi.mocked(streamText).mock.calls[0]![0]!.tools;
    expect(tools).toBeDefined();
    expect(Object.keys(tools!).sort()).toEqual(['finalize', 'grep_doc', 'outline', 'read_lines']);
  });

  it('uses an array stopWhen of length 2 (step budget + hasToolCall(finalize))', async () => {
    await streamChat(messages, document, apiKey);

    const { stopWhen } = vi.mocked(streamText).mock.calls[0]![0]!;
    expect(Array.isArray(stopWhen)).toBe(true);
    expect(stopWhen as unknown[]).toHaveLength(2);
  });

  it('uses a step budget of 12 (10 exploration + 1 voluntary-finalize + 1 forced-finalize)', async () => {
    await streamChat(messages, document, apiKey);

    expect(vi.mocked(stepCountIs)).toHaveBeenCalledWith(12);
  });

  it('forces toolChoice: finalize on the last allowed step (ucs-0f3 structural fix)', async () => {
    await streamChat(messages, document, apiKey);

    const { prepareStep } = vi.mocked(streamText).mock.calls[0]![0]!;
    expect(typeof prepareStep).toBe('function');

    const forced = await prepareStep!({
      stepNumber: 11,
      steps: [],
      model: {} as never,
      messages: [],
      experimental_context: undefined
    });
    expect(forced).toEqual({ toolChoice: { type: 'tool', toolName: 'finalize' } });

    const early = await prepareStep!({
      stepNumber: 5,
      steps: [],
      model: {} as never,
      messages: [],
      experimental_context: undefined
    });
    expect(early).toBeUndefined();
  });

  it('constructs a per-request Anthropic provider with the supplied apiKey', async () => {
    await streamChat(messages, document, apiKey);

    expect(vi.mocked(createAnthropic)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createAnthropic).mock.calls[0]![0]).toEqual({ apiKey });
  });

  it('forwards abortSignal into streamText when supplied', async () => {
    const controller = new AbortController();
    await streamChat(messages, document, apiKey, controller.signal);

    expect(vi.mocked(streamText).mock.calls[0]![0]!.abortSignal).toBe(controller.signal);
  });

  it('omits abortSignal from streamText when not supplied', async () => {
    await streamChat(messages, document, apiKey);

    expect(vi.mocked(streamText).mock.calls[0]![0]!.abortSignal).toBeUndefined();
  });

  it('passes an onError handler to streamText that never logs the response body', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await streamChat(messages, document, apiKey);
      const { onError } = vi.mocked(streamText).mock.calls[0]![0]!;
      expect(typeof onError).toBe('function');

      // Hand the handler an error that intentionally carries a secret-bearing
      // responseBody — the contract is that the handler MUST NOT pass that
      // object into any console.* call. We assert the spy was either not
      // invoked, or invoked with arguments that do not contain the secret.
      const err = new Error('boom');
      (err as unknown as { responseBody: string }).responseBody =
        '{"messages":[...],"apiKey":"sk-ant-LEAK"}';
      (err as unknown as { statusCode: number }).statusCode = 500;
      onError!({ error: err });

      for (const call of consoleSpy.mock.calls) {
        const flat = JSON.stringify(call);
        expect(flat).not.toMatch(/sk-ant-LEAK/);
        expect(flat).not.toMatch(/responseBody/);
      }
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("passes onError to toUIMessageStreamResponse that returns a fixed 'Upstream provider error' string", async () => {
    await streamChat(messages, document, apiKey);

    expect(toUIMessageStreamResponseMock).toHaveBeenCalledTimes(1);
    const opts = toUIMessageStreamResponseMock.mock.calls[0]![0] as
      | { onError?: (e: unknown) => string }
      | undefined;
    expect(typeof opts?.onError).toBe('function');

    // Regardless of the underlying error shape, the override returns the
    // fixed string — the AI SDK default String(err) would otherwise splash
    // the provider's echoed request payload into the client stream.
    const leakyErr = new Error('rate limit');
    (leakyErr as unknown as { responseBody: string }).responseBody =
      '{"apiKey":"sk-ant-LEAK"}';
    expect(opts!.onError!(leakyErr)).toBe('Upstream provider error');
    expect(opts!.onError!('plain string error')).toBe('Upstream provider error');
    expect(opts!.onError!(undefined)).toBe('Upstream provider error');
  });
});
