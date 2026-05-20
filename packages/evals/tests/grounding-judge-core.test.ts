import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { gradeGrounding, JUDGE_PASS_THRESHOLD } from '../src/judges/grounding-judge-core.ts';

vi.mock('ai', () => ({
  generateText: vi.fn()
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn((id: string) => ({ __model: id }))
}));

const BASE_INPUT = {
  question: 'what is the teapot status code?',
  output: 'It is 418 — see L42.',
  document: {
    text: 'L1 RFC 2324\nL42 The HTCPCP server returns 418 (teapot).',
    title: 'RFC 2324',
    sourceUrl: 'https://www.rfc-editor.org/rfc/rfc2324.html'
  }
};

describe('gradeGrounding', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.mocked(anthropic).mockReset();
    vi.mocked(anthropic).mockImplementation((id: string) => ({ __model: id }) as never);
  });

  it('A: happy path — returns a matching Verdict when judge produces clean JSON', async () => {
    const raw = '{"pass": true, "score": 0.85, "reason": "well-grounded"}';
    vi.mocked(generateText).mockResolvedValueOnce({ text: raw } as never);

    const verdict = await gradeGrounding(BASE_INPUT);

    expect(verdict).toEqual({
      pass: true,
      score: 0.85,
      reason: 'well-grounded',
      raw
    });
  });

  it('B: threshold override — judge claims pass=true at 0.5 but Verdict.pass is false', async () => {
    const raw = '{"pass": true, "score": 0.5, "reason": "borderline"}';
    vi.mocked(generateText).mockResolvedValueOnce({ text: raw } as never);

    const verdict = await gradeGrounding(BASE_INPUT);

    expect(verdict.pass).toBe(false);
    expect(verdict.score).toBe(0.5);
    expect(verdict.score).toBeLessThan(JUDGE_PASS_THRESHOLD);
    expect(verdict.reason).toBe('borderline');
  });

  it('C: malformed (no JSON at all) — returns the fail-shape with raw preserved', async () => {
    const raw = 'sorry, I cannot answer';
    vi.mocked(generateText).mockResolvedValueOnce({ text: raw } as never);

    const verdict = await gradeGrounding(BASE_INPUT);

    expect(verdict.pass).toBe(false);
    expect(verdict.score).toBe(0);
    expect(verdict.reason).toMatch(/malformed|JSON/i);
    expect(verdict.raw).toBe(raw);
  });

  it('D: score out of range — same fail-shape as malformed', async () => {
    const raw = '{"pass": true, "score": 1.5, "reason": "x"}';
    vi.mocked(generateText).mockResolvedValueOnce({ text: raw } as never);

    const verdict = await gradeGrounding(BASE_INPUT);

    expect(verdict.pass).toBe(false);
    expect(verdict.score).toBe(0);
    expect(verdict.reason).toMatch(/malformed|range/i);
    expect(verdict.raw).toBe(raw);
  });

  it('E: custom judge model — anthropic() is called with the override id', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"pass": true, "score": 0.9, "reason": "ok"}'
    } as never);

    await gradeGrounding({ ...BASE_INPUT, judgeModel: 'claude-opus-4-7' });

    expect(vi.mocked(anthropic).mock.calls[0]?.[0]).toBe('claude-opus-4-7');
  });

  it('F: prose-prefixed JSON in markdown fences — extracted, parsed, raw preserved verbatim', async () => {
    const raw = 'Here is the verdict:\n```json\n{"pass": true, "score": 0.8, "reason": "ok"}\n```';
    vi.mocked(generateText).mockResolvedValueOnce({ text: raw } as never);

    const verdict = await gradeGrounding(BASE_INPUT);

    expect(verdict).toEqual({
      pass: true,
      score: 0.8,
      reason: 'ok',
      raw
    });
  });

  it('G: empty output — short-circuits to fail without calling the judge', async () => {
    const verdict = await gradeGrounding({ ...BASE_INPUT, output: '' });

    expect(verdict.pass).toBe(false);
    expect(verdict.score).toBe(0);
    expect(verdict.reason).toMatch(/empty/i);
    expect(verdict.raw).toBe('');
    expect(vi.mocked(generateText)).not.toHaveBeenCalled();
  });

  it('H: whitespace-only output — same short-circuit fail as empty', async () => {
    const verdict = await gradeGrounding({ ...BASE_INPUT, output: '   \n\t  ' });

    expect(verdict.pass).toBe(false);
    expect(verdict.score).toBe(0);
    expect(verdict.reason).toMatch(/empty/i);
    expect(verdict.raw).toBe('');
    expect(vi.mocked(generateText)).not.toHaveBeenCalled();
  });
});
