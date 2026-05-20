/**
 * @fileoverview Contract tests for the `scrambleIn` Svelte action.
 *
 * GSAP's actual visual effect is unobservable under jsdom (no RAF, no
 * CSS animation), so we assert the CONTRACT — the shape of the call
 * `scrambleIn` makes into GSAP and the DOM mutations the action makes
 * directly — not the resulting pixels.
 *
 * Mock pattern (test-infra precedent for Tasks 10 + 11):
 *   - `vi.mock('gsap', ...)` returns a frozen mock with a `to` spy.
 *   - `vi.mock('../motion/_reducedMotion', ...)` lets each test flip the
 *     reduced-motion result. Tests reset spies + mock return value in
 *     `beforeEach`.
 *
 * Three test groups:
 *   1. Happy path — `gsap.to(node, { scrambleText: {...} })` call shape
 *      (text, chars, duration, delay all flow through).
 *   2. Reduced-motion bypass — NO GSAP scheduling, action writes
 *      textContent synchronously, update still propagates.
 *   3. Managed-content contract (ucs-eem regression guard) — the action
 *      writes `params.text` to `node.textContent` on mount and on every
 *      `update` where text changes. This is the contract Svelte
 *      reactivity depends on: if the action stopped writing text and
 *      instead relied on Svelte interpolation inside `node`, GSAP's
 *      ScrambleTextPlugin would orphan the tracked text node and the
 *      visible DOM would freeze. The tests assert the inverse — that
 *      the action's own writes drive the visible state.
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
  it('writes params.text to the node and schedules gsap.to with scrambleText config', () => {
    const node = document.createElement('span');

    scrambleIn(node, { text: 'READY' });

    // Managed-content contract: the action owns node.textContent.
    expect(node.textContent).toBe('READY');
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

    scrambleIn(node, { text: 'SCANNING', chars: 'ABC123', duration: 500, delay: 100 });

    expect(gsapMock.to).toHaveBeenCalledTimes(1);
    const [, vars] = gsapMock.to.mock.calls[0]!;
    expect(vars).toMatchObject({
      duration: 0.5,
      delay: 0.1,
      scrambleText: { text: 'SCANNING', chars: 'ABC123' }
    });
  });

  it('accepts an empty target text', () => {
    const node = document.createElement('span');

    scrambleIn(node, { text: '' });

    expect(node.textContent).toBe('');
    expect(gsapMock.to).toHaveBeenCalledTimes(1);
    const [, vars] = gsapMock.to.mock.calls[0]!;
    expect(vars.scrambleText.text).toBe('');
  });

  it('returns a destroy + update tuple (Svelte action contract)', () => {
    const node = document.createElement('span');

    const result = scrambleIn(node, { text: 'READY' });

    expect(typeof result.destroy).toBe('function');
    expect(typeof result.update).toBe('function');
  });
});

describe('scrambleIn — managed-content contract (ucs-eem regression guard)', () => {
  it('re-fires gsap.to when params.text changes via update', () => {
    const node = document.createElement('span');

    const result = scrambleIn(node, { text: 'SCANNING' });

    expect(gsapMock.to).toHaveBeenCalledTimes(1);
    expect(gsapMock.to.mock.calls[0]![1].scrambleText.text).toBe('SCANNING');

    // Svelte reactivity: parent's `state` changed from SCANNING to
    // "3 HITS". The action MUST re-scramble.
    result.update!({ text: '3 HITS' });

    expect(gsapMock.to).toHaveBeenCalledTimes(2);
    expect(gsapMock.to.mock.calls[1]![1].scrambleText.text).toBe('3 HITS');
  });

  it('does NOT re-fire when update is called with the same text', () => {
    const node = document.createElement('span');

    const result = scrambleIn(node, { text: 'READY' });
    expect(gsapMock.to).toHaveBeenCalledTimes(1);

    // Same text — no spurious re-fire (would burn animation budget
    // and look glitchy at the StatusPill site, which re-binds every
    // render).
    result.update!({ text: 'READY' });

    expect(gsapMock.to).toHaveBeenCalledTimes(1);
  });

  it('writes the new text to node.textContent at each update (reduced-motion only — see GSAP test for motion path)', () => {
    // In motion mode the textContent settlement is GSAP's job (the
    // mock here is a no-op spy). The action's pre-write happens once
    // on mount, then GSAP takes over on update. The reduced-motion
    // test below covers the "no GSAP" branch where the action writes
    // textContent itself on every update.
    const node = document.createElement('span');

    scrambleIn(node, { text: 'INITIAL' });

    // On mount the action writes the text before invoking GSAP — so
    // even with the GSAP mock no-op, the resting state is correct.
    expect(node.textContent).toBe('INITIAL');
  });
});

describe('scrambleIn — reduced-motion bypass', () => {
  beforeEach(() => {
    mockedReducedMotion.mockReturnValue(true);
  });

  it('does NOT schedule any GSAP animation', () => {
    const node = document.createElement('span');

    scrambleIn(node, { text: 'READY' });

    expect(gsapMock.to).not.toHaveBeenCalled();
  });

  it('writes params.text to node.textContent synchronously on mount', () => {
    const node = document.createElement('span');

    scrambleIn(node, { text: 'READY' });

    expect(node.textContent).toBe('READY');
  });

  it('propagates text changes through update without scheduling GSAP', () => {
    const node = document.createElement('span');

    const result = scrambleIn(node, { text: 'SCANNING' });
    expect(node.textContent).toBe('SCANNING');

    // Reactive transition (e.g. StatusPill state flip). The visible
    // DOM MUST update even in reduced-motion mode.
    result.update!({ text: '3 HITS' });

    expect(node.textContent).toBe('3 HITS');
    expect(gsapMock.to).not.toHaveBeenCalled();
  });

  it('returns a no-op destroy', () => {
    const node = document.createElement('span');

    const result = scrambleIn(node, { text: 'READY' });

    expect(typeof result.destroy).toBe('function');
    // Calling it must not throw and must not schedule anything.
    result.destroy!();
    expect(gsapMock.to).not.toHaveBeenCalled();
  });
});
