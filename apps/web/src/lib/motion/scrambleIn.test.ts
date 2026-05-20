/**
 * @fileoverview Contract tests for the `scrambleIn` Svelte action.
 *
 * GSAP's actual visual effect is unobservable under jsdom (no RAF, no
 * CSS animation), so we assert the CONTRACT — the shape of the call
 * `scrambleIn` makes into GSAP — not the resulting pixels.
 *
 * Mock pattern (test-infra precedent for Tasks 10 + 11):
 *   - `vi.mock('gsap', ...)` returns a frozen mock with a `to` spy.
 *   - `vi.mock('../motion/_reducedMotion', ...)` lets each test flip the
 *     reduced-motion result. Tests reset spies + mock return value in
 *     `beforeEach`.
 *
 * Two cycles per action:
 *   1. Happy path — asserts the `gsap.to(node, { scrambleText: {...} })`
 *      call shape (text, chars, duration, delay all flow through).
 *   2. Reduced-motion bypass — asserts that NO GSAP scheduling occurs
 *      and the final text is set synchronously on the node.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock GSAP. The action only consumes `gsap.to`; the rest of the surface
// is stubbed so `registerGsap` (which the layout calls but the action
// itself doesn't) won't blow up if it happens to be imported anywhere
// in the resolution chain.
//
// `vi.mock` factories are hoisted above the file's imports, so the spy
// object must be created inside `vi.hoisted` to be available at factory
// evaluation time. The mock module re-exports the same hoisted object
// for both the default and named `gsap` exports.
const { gsapMock } = vi.hoisted(() => {
  return {
    gsapMock: {
      to: vi.fn(),
      from: vi.fn(),
      timeline: vi.fn(),
      registerPlugin: vi.fn(),
      ticker: { add: vi.fn(), remove: vi.fn() }
    }
  };
});

vi.mock('gsap', () => ({ default: gsapMock, gsap: gsapMock }));
vi.mock('gsap/ScrambleTextPlugin', () => ({
  ScrambleTextPlugin: { name: 'ScrambleTextPlugin' }
}));

// Mock the reduced-motion helper so each test controls its return value.
vi.mock('./_reducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => false)
}));

import { scrambleIn } from './scrambleIn';
import { prefersReducedMotion } from './_reducedMotion';

const mockedReducedMotion = vi.mocked(prefersReducedMotion);

beforeEach(() => {
  gsapMock.to.mockClear();
  mockedReducedMotion.mockReturnValue(false);
});

describe('scrambleIn — happy path (motion enabled)', () => {
  it('captures node.textContent and schedules gsap.to with scrambleText config', () => {
    const node = document.createElement('span');
    node.textContent = 'READY';

    scrambleIn(node);

    expect(gsapMock.to).toHaveBeenCalledTimes(1);
    const [target, vars] = gsapMock.to.mock.calls[0]!;
    expect(target).toBe(node);
    expect(vars).toMatchObject({
      duration: 0.28, // 280ms → 0.28s (GSAP uses seconds)
      delay: 0,
      scrambleText: {
        text: 'READY',
        chars: '01<>/|_-+=:'
      }
    });
  });

  it('respects custom chars + duration + delay params', () => {
    const node = document.createElement('span');
    node.textContent = 'SCANNING';

    scrambleIn(node, { chars: 'ABC123', duration: 500, delay: 100 });

    expect(gsapMock.to).toHaveBeenCalledTimes(1);
    const [, vars] = gsapMock.to.mock.calls[0]!;
    expect(vars).toMatchObject({
      duration: 0.5,
      delay: 0.1,
      scrambleText: { text: 'SCANNING', chars: 'ABC123' }
    });
  });

  it('falls back to an empty captured text when the node is initially empty', () => {
    const node = document.createElement('span');
    // textContent is '' by default.

    scrambleIn(node);

    expect(gsapMock.to).toHaveBeenCalledTimes(1);
    const [, vars] = gsapMock.to.mock.calls[0]!;
    expect(vars.scrambleText.text).toBe('');
  });

  it('returns a destroy function (Svelte action contract)', () => {
    const node = document.createElement('span');
    node.textContent = 'READY';

    const result = scrambleIn(node);

    expect(typeof result.destroy).toBe('function');
  });
});

describe('scrambleIn — reduced-motion bypass', () => {
  beforeEach(() => {
    mockedReducedMotion.mockReturnValue(true);
  });

  it('does NOT schedule any GSAP animation', () => {
    const node = document.createElement('span');
    node.textContent = 'READY';

    scrambleIn(node);

    expect(gsapMock.to).not.toHaveBeenCalled();
  });

  it('leaves the captured final text intact on the node', () => {
    const node = document.createElement('span');
    node.textContent = 'READY';

    scrambleIn(node);

    // No scramble happened, so the node still shows the original text.
    expect(node.textContent).toBe('READY');
  });

  it('returns a no-op destroy', () => {
    const node = document.createElement('span');
    node.textContent = 'READY';

    const result = scrambleIn(node);

    expect(typeof result.destroy).toBe('function');
    // Calling it must not throw and must not schedule anything.
    result.destroy!();
    expect(gsapMock.to).not.toHaveBeenCalled();
  });
});
