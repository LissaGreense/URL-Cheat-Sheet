/**
 * @fileoverview Contract tests for the `assembleCascade` Svelte action.
 *
 * GSAP visual effects are unobservable under jsdom. We mock `gsap` and
 * assert the CALL CONTRACT — the shape of the tween calls
 * `assembleCascade` issues — not the resulting pixels.
 *
 * The action drives two things on every `update`:
 *   1. The `.compile-bar` child's `height` animates to the current
 *      `streamedChars / totalEstimatedChars` ratio (capped at 100%).
 *   2. Any newly-appeared text line inside the host (detected via
 *      MutationObserver on the descendant text container) gets a
 *      `scrambleIn`-style scramble. We assert the action invokes
 *      `scrambleIn` from `./scrambleIn` for the right nodes.
 *
 * Mock pattern mirrors Task 9 + the scanSweep test:
 *   - `vi.mock('gsap', ...)` provides a frozen mock with a `to` spy.
 *   - `vi.mock('./scrambleIn', ...)` provides a spy so the test can
 *     count + inspect per-line scramble invocations.
 *   - `vi.mock('./_reducedMotion', ...)` lets each test flip the result.
 *
 * Four cycles:
 *   1. Mount + happy path — first `update` after mount animates the
 *      `.compile-bar` height to the current ratio.
 *   2. Streaming progression — subsequent `update`s tween the bar's
 *      height to the new ratio; the ratio is capped at 100%.
 *   3. Reduced-motion bypass — the bar's height is set DIRECTLY
 *      (inline style) without any GSAP scheduling, and `scrambleIn`
 *      is never called.
 *   4. Per-line scramble — when new `.finalize__line` elements appear
 *      inside the text container, `scrambleIn` is invoked on each new
 *      line node.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { gsapMock } = vi.hoisted(() => {
  return {
    gsapMock: {
      to: vi.fn(),
      from: vi.fn(),
      set: vi.fn(),
      timeline: vi.fn(),
      registerPlugin: vi.fn(),
      ticker: { add: vi.fn(), remove: vi.fn() }
    }
  };
});

vi.mock('gsap', () => ({ default: gsapMock, gsap: gsapMock }));

vi.mock('./_reducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => false)
}));

vi.mock('./scrambleIn', () => ({
  scrambleIn: vi.fn(() => ({ destroy: vi.fn() }))
}));

import { assembleCascade } from './assembleCascade';
import { prefersReducedMotion } from './_reducedMotion';
import { scrambleIn } from './scrambleIn';

const mockedReducedMotion = vi.mocked(prefersReducedMotion);
const mockedScrambleIn = vi.mocked(scrambleIn);

/**
 * Build a host with the conventional internal markup:
 *   <host>
 *     <div class="compile-bar"></div>
 *     <div class="finalize__content"></div>     <-- text container
 *   </host>
 *
 * The text container is the MutationObserver target — new
 * `.finalize__line` children appearing inside it trigger scramble.
 */
function makeHost(): {
  host: HTMLElement;
  bar: HTMLElement;
  textContainer: HTMLElement;
} {
  const host = document.createElement('div');
  const bar = document.createElement('div');
  bar.classList.add('compile-bar');
  const textContainer = document.createElement('div');
  textContainer.classList.add('finalize__content');
  host.appendChild(bar);
  host.appendChild(textContainer);
  return { host, bar, textContainer };
}

beforeEach(() => {
  gsapMock.to.mockClear();
  gsapMock.set.mockClear();
  mockedReducedMotion.mockReturnValue(false);
  mockedScrambleIn.mockClear();
});

describe('assembleCascade — happy path (motion enabled)', () => {
  it('animates .compile-bar height to the current ratio (as a %) on mount', () => {
    const { host, bar } = makeHost();

    assembleCascade(host, { streamedChars: 250, totalEstimatedChars: 1000 });

    expect(gsapMock.to).toHaveBeenCalled();
    const [target, vars] = gsapMock.to.mock.calls[0]!;
    expect(target).toBe(bar);
    expect(vars).toMatchObject({ height: '25%' });
  });

  it('caps the height at 100% when streamedChars exceeds totalEstimatedChars', () => {
    const { host } = makeHost();

    assembleCascade(host, { streamedChars: 2000, totalEstimatedChars: 1000 });

    const [, vars] = gsapMock.to.mock.calls[0]!;
    expect(vars).toMatchObject({ height: '100%' });
  });

  it('handles a zero totalEstimatedChars without dividing by zero', () => {
    const { host } = makeHost();

    assembleCascade(host, { streamedChars: 0, totalEstimatedChars: 0 });

    // Implementation should treat 0/0 as 0% — we never animate to NaN.
    const [, vars] = gsapMock.to.mock.calls[0]!;
    expect(vars).toMatchObject({ height: '0%' });
  });

  it('tweens the bar height to a new ratio on update', () => {
    const { host, bar } = makeHost();

    const handle = assembleCascade(host, {
      streamedChars: 250,
      totalEstimatedChars: 1000
    });
    handle.update!({ streamedChars: 500, totalEstimatedChars: 1000 });

    expect(gsapMock.to).toHaveBeenCalledTimes(2);
    const [target, vars] = gsapMock.to.mock.calls[1]!;
    expect(target).toBe(bar);
    expect(vars).toMatchObject({ height: '50%' });
  });

  it('returns destroy + update handles (Svelte action contract)', () => {
    const { host } = makeHost();

    const handle = assembleCascade(host, { streamedChars: 0, totalEstimatedChars: 100 });

    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.update).toBe('function');
  });
});

describe('assembleCascade — per-line scramble', () => {
  it('invokes scrambleIn on each new .finalize__line child added to the text container', async () => {
    const { host, textContainer } = makeHost();

    assembleCascade(host, { streamedChars: 0, totalEstimatedChars: 100 });

    // Add two lines in a single mutation batch.
    const line1 = document.createElement('p');
    line1.classList.add('finalize__line');
    line1.textContent = 'first line';
    const line2 = document.createElement('p');
    line2.classList.add('finalize__line');
    line2.textContent = 'second line';
    textContainer.appendChild(line1);
    textContainer.appendChild(line2);

    // MutationObserver callbacks are microtask-deferred — yield once.
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(mockedScrambleIn).toHaveBeenCalledTimes(2);
    const targets = mockedScrambleIn.mock.calls.map((c) => c[0]);
    expect(targets).toContain(line1);
    expect(targets).toContain(line2);
  });

  it('passes a ~180ms duration to scrambleIn (per-line cadence per spec §5.2)', async () => {
    const { host, textContainer } = makeHost();

    assembleCascade(host, { streamedChars: 0, totalEstimatedChars: 100 });

    const line = document.createElement('p');
    line.classList.add('finalize__line');
    line.textContent = 'one line';
    textContainer.appendChild(line);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(mockedScrambleIn).toHaveBeenCalledTimes(1);
    const [, params] = mockedScrambleIn.mock.calls[0]!;
    expect(params).toMatchObject({ duration: 180 });
  });

  it('does NOT re-scramble lines that were already present at mount', async () => {
    const { host, textContainer } = makeHost();
    // Pre-populate with an existing line — this should NOT scramble.
    const stale = document.createElement('p');
    stale.classList.add('finalize__line');
    stale.textContent = 'already here';
    textContainer.appendChild(stale);

    assembleCascade(host, { streamedChars: 0, totalEstimatedChars: 100 });

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // The observer only fires for nodes added AFTER it's wired.
    expect(mockedScrambleIn).not.toHaveBeenCalled();
  });

  it('ignores non-.finalize__line children appearing in the text container', async () => {
    const { host, textContainer } = makeHost();

    assembleCascade(host, { streamedChars: 0, totalEstimatedChars: 100 });

    const unrelated = document.createElement('span');
    unrelated.classList.add('finalize__citations');
    textContainer.appendChild(unrelated);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(mockedScrambleIn).not.toHaveBeenCalled();
  });
});

describe('assembleCascade — reduced-motion bypass', () => {
  beforeEach(() => {
    mockedReducedMotion.mockReturnValue(true);
  });

  it('jumps the bar height directly via inline style (no gsap.to)', () => {
    const { host, bar } = makeHost();

    assembleCascade(host, { streamedChars: 250, totalEstimatedChars: 1000 });

    expect(gsapMock.to).not.toHaveBeenCalled();
    expect(bar.style.height).toBe('25%');
  });

  it('updates the bar height directly on subsequent updates', () => {
    const { host, bar } = makeHost();

    const handle = assembleCascade(host, {
      streamedChars: 250,
      totalEstimatedChars: 1000
    });
    handle.update!({ streamedChars: 500, totalEstimatedChars: 1000 });

    expect(gsapMock.to).not.toHaveBeenCalled();
    expect(bar.style.height).toBe('50%');
  });

  it('does NOT scramble per-line text', async () => {
    const { host, textContainer } = makeHost();

    assembleCascade(host, { streamedChars: 0, totalEstimatedChars: 100 });

    const line = document.createElement('p');
    line.classList.add('finalize__line');
    textContainer.appendChild(line);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(mockedScrambleIn).not.toHaveBeenCalled();
  });

  it('returns a no-op-friendly update + destroy', () => {
    const { host } = makeHost();

    const handle = assembleCascade(host, {
      streamedChars: 0,
      totalEstimatedChars: 100
    });

    expect(typeof handle.update).toBe('function');
    expect(typeof handle.destroy).toBe('function');
    expect(() => handle.destroy!()).not.toThrow();
  });
});

describe('assembleCascade — defensive: missing children', () => {
  it('no-ops gracefully when the host has no .compile-bar child', () => {
    const host = document.createElement('div');

    const handle = assembleCascade(host, {
      streamedChars: 100,
      totalEstimatedChars: 200
    });

    expect(gsapMock.to).not.toHaveBeenCalled();
    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.update).toBe('function');
    expect(() => handle.update!({ streamedChars: 200, totalEstimatedChars: 200 })).not.toThrow();
    expect(() => handle.destroy!()).not.toThrow();
  });
});
