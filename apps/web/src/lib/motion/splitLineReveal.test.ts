/**
 * @fileoverview Contract tests for the `splitLineReveal` Svelte action.
 *
 * GSAP visual effects are unobservable under jsdom. We mock GSAP +
 * SplitText and assert the CALL CONTRACT — what `splitLineReveal` asks
 * GSAP to do — not the resulting pixels.
 *
 * Two cycles:
 *   1. Happy path — `new SplitText(node, { type: 'lines' })` runs, then
 *      `gsap.from(lines, { ... })` schedules the clip-path reveal with
 *      stagger + ease.
 *   2. Reduced-motion bypass — neither SplitText nor gsap.from runs,
 *      and `destroy` is still callable.
 *
 * The destroy contract: `splitText.revert()` MUST be called on the
 * instance returned from the SplitText constructor (critical to avoid
 * leaking line-wrapper divs into the DOM when the parent component
 * unmounts mid-animation).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted mock containers — vi.mock factories are hoisted above
// imports, so we use vi.hoisted to keep references the test can poke.
const { gsapMock, splitTextMock, splitTextInstance } = vi.hoisted(() => {
  // The instance handed back from `new SplitText(...)`. `lines` is what
  // the action animates; `revert` is what `destroy` calls.
  const instance = {
    lines: [] as Element[],
    revert: vi.fn()
  };
  return {
    gsapMock: {
      to: vi.fn(),
      from: vi.fn(),
      timeline: vi.fn(),
      registerPlugin: vi.fn(),
      ticker: { add: vi.fn(), remove: vi.fn() }
    },
    // `new SplitText(...)` calls this — vi.fn produces a spy that's
    // also a valid constructor when used with `new`. The factory
    // signature gives `.mock.calls` a typed tuple so the test reads
    // args off it without dynamic indexing complaints from
    // noUncheckedIndexedAccess. The factory itself ignores its args
    // (assertions live in the test bodies) and returns the shared
    // instance so destroy assertions can target it.
    splitTextMock: vi.fn(function SplitTextStub(target: unknown, vars: { type: string }) {
      // Reference args so eslint's no-unused-vars stays quiet without
      // adding rule overrides; the values themselves don't matter.
      void target;
      void vars;
      return instance;
    }),
    splitTextInstance: instance
  };
});

vi.mock('gsap', () => ({ default: gsapMock, gsap: gsapMock }));
vi.mock('gsap/SplitText', () => ({ SplitText: splitTextMock }));

vi.mock('./_reducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => false)
}));

import { splitLineReveal } from './splitLineReveal';
import { prefersReducedMotion } from './_reducedMotion';

const mockedReducedMotion = vi.mocked(prefersReducedMotion);

beforeEach(() => {
  gsapMock.from.mockClear();
  splitTextMock.mockClear();
  splitTextInstance.revert.mockClear();
  splitTextInstance.lines = [document.createElement('div'), document.createElement('div')];
  mockedReducedMotion.mockReturnValue(false);
});

describe('splitLineReveal — happy path (motion enabled)', () => {
  it('instantiates SplitText with { type: "lines" } on the target node', () => {
    const node = document.createElement('p');
    node.textContent = 'LOAD URL TO YOUR MEMORY';

    splitLineReveal(node);

    expect(splitTextMock).toHaveBeenCalledTimes(1);
    const [target, vars] = splitTextMock.mock.calls[0]!;
    expect(target).toBe(node);
    expect(vars).toMatchObject({ type: 'lines' });
  });

  it('schedules gsap.from on the split lines with clip-path + stagger + ease', () => {
    const node = document.createElement('p');
    node.textContent = 'LOAD URL TO YOUR MEMORY';

    splitLineReveal(node);

    expect(gsapMock.from).toHaveBeenCalledTimes(1);
    const [target, vars] = gsapMock.from.mock.calls[0]!;
    expect(target).toBe(splitTextInstance.lines);
    expect(vars).toMatchObject({
      clipPath: 'inset(0 0 100% 0)',
      duration: 0.8, // 800ms → 0.8s
      delay: 0,
      stagger: 0.06 // 60ms → 0.06s
    });
    // Ease is the spec'd `--ease-out-expo` cubic-bezier curve.
    expect(vars.ease).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  });

  it('respects custom stagger + duration + delay params', () => {
    const node = document.createElement('p');
    node.textContent = 'LOAD URL TO YOUR MEMORY';

    splitLineReveal(node, { stagger: 120, duration: 1200, delay: 200 });

    const [, vars] = gsapMock.from.mock.calls[0]!;
    expect(vars).toMatchObject({
      duration: 1.2,
      delay: 0.2,
      stagger: 0.12
    });
  });

  it('returns a destroy that calls revert() on the SplitText instance', () => {
    const node = document.createElement('p');
    node.textContent = 'LOAD URL TO YOUR MEMORY';

    const result = splitLineReveal(node);

    expect(splitTextInstance.revert).not.toHaveBeenCalled();
    result.destroy!();
    expect(splitTextInstance.revert).toHaveBeenCalledTimes(1);
  });
});

describe('splitLineReveal — reduced-motion bypass', () => {
  beforeEach(() => {
    mockedReducedMotion.mockReturnValue(true);
  });

  it('does NOT instantiate SplitText', () => {
    const node = document.createElement('p');
    node.textContent = 'LOAD URL TO YOUR MEMORY';

    splitLineReveal(node);

    expect(splitTextMock).not.toHaveBeenCalled();
  });

  it('does NOT schedule a GSAP animation', () => {
    const node = document.createElement('p');
    node.textContent = 'LOAD URL TO YOUR MEMORY';

    splitLineReveal(node);

    expect(gsapMock.from).not.toHaveBeenCalled();
  });

  it('returns a no-op destroy that does not throw', () => {
    const node = document.createElement('p');
    node.textContent = 'LOAD URL TO YOUR MEMORY';

    const result = splitLineReveal(node);

    expect(typeof result.destroy).toBe('function');
    result.destroy!();
    expect(splitTextInstance.revert).not.toHaveBeenCalled();
  });
});
