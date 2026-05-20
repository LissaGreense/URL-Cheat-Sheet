import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssertionValueFunctionContext } from 'promptfoo';
import gradeGroundingAssertion from '../src/asserts/grounding-judge.ts';
import { gradeGrounding } from '../src/judges/grounding-judge-core.ts';

vi.mock('../src/judges/grounding-judge-core', () => ({
  gradeGrounding: vi.fn()
}));

const VALID_DOCUMENT = {
  text: 'doc',
  title: 't',
  sourceUrl: 'https://e/'
};

function makeContext(overrides: {
  vars?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): AssertionValueFunctionContext {
  return {
    prompt: undefined,
    vars: (overrides.vars ?? {}) as AssertionValueFunctionContext['vars'],
    test: {} as AssertionValueFunctionContext['test'],
    logProbs: undefined,
    provider: undefined,
    providerResponse: {
      metadata: overrides.metadata ?? {}
    } as AssertionValueFunctionContext['providerResponse']
  };
}

describe('gradeGroundingAssertion', () => {
  beforeEach(() => {
    vi.mocked(gradeGrounding).mockReset();
  });

  it('A: happy path — maps Verdict to GradingResult, dropping raw', async () => {
    vi.mocked(gradeGrounding).mockResolvedValueOnce({
      pass: true,
      score: 0.9,
      reason: 'g',
      raw: ''
    });

    const result = await gradeGroundingAssertion(
      'agent text',
      makeContext({
        vars: { question: 'q' },
        metadata: { document: VALID_DOCUMENT }
      })
    );

    expect(result).toEqual({ pass: true, score: 0.9, reason: 'g' });
  });

  it('B: missing document — fail-shape, gradeGrounding NOT called', async () => {
    const result = await gradeGroundingAssertion(
      'agent text',
      makeContext({ vars: { question: 'q' }, metadata: {} })
    );

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/no document/i);
    expect(vi.mocked(gradeGrounding)).not.toHaveBeenCalled();
  });

  it('C: missing question — fail-shape, gradeGrounding NOT called', async () => {
    const result = await gradeGroundingAssertion(
      'agent text',
      makeContext({ vars: {}, metadata: { document: VALID_DOCUMENT } })
    );

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/no question/i);
    expect(vi.mocked(gradeGrounding)).not.toHaveBeenCalled();
  });

  it('D: document text empty — fail-shape with /no document/i', async () => {
    const result = await gradeGroundingAssertion(
      'agent text',
      makeContext({
        vars: { question: 'q' },
        metadata: { document: { ...VALID_DOCUMENT, text: '' } }
      })
    );

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/no document/i);
  });
});
