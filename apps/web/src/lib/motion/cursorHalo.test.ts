/**
 * @fileoverview Contract tests for the `cursorHalo` Svelte action.
 *
 * RAF-driven, not pure CSS. The action subscribes to `pointermove` on
 * the window, throttles updates via `requestAnimationFrame`, and on
 * each frame lerps the current `--cx`/`--cy` values toward the latest
 * pointer position by a configurable `follow` factor. The halo gradient
 * itself is CSS — defined in `atmosphere.css` against the custom
 * properties.
 *
 * Three cycles:
 *   1. Happy path — pointermove updates the CSS custom properties on
 *      the node after a RAF tick. Custom `follow` factor flows through.
 *   2. Reduced-motion bypass — no listeners are added, no RAF is
 *      scheduled, no custom properties are written.
 *   3. Pointer-coarse no-op — on touch devices the halo would float
 *      mid-screen (no hover), so no listeners + no RAF + no writes.
 *
 * We mock `_reducedMotion` and (separately) stub `window.matchMedia` so
 * each test can flip both axes independently.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./_reducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => false)
}));

import { cursorHalo } from './cursorHalo';
import { prefersReducedMotion } from './_reducedMotion';

const mockedReducedMotion = vi.mocked(prefersReducedMotion);

/**
 * Saved references restored after each test so we don't leak window
 * patches across files.
 */
let originalMatchMedia: typeof window.matchMedia;
let originalRAF: typeof window.requestAnimationFrame;
let originalCAF: typeof window.cancelAnimationFrame;

/**
 * Patch `window.matchMedia` so it returns `matches: true` for the given
 * query and `false` for everything else. Tests that care about
 * pointer-coarse pass `'(pointer: coarse)'`; tests that don't pass an
 * empty string (nothing matches).
 */
function patchMatchMedia(matchingQuery: string): void {
  window.matchMedia = ((query: string) => ({
    matches: query === matchingQuery,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })) as typeof window.matchMedia;
}

/**
 * Synchronously run any RAF callbacks the action has scheduled. Vitest
 * fake timers with `toFake: ['requestAnimationFrame']` would also work,
 * but stubbing the global directly is cheaper and lets each test count
 * scheduled callbacks precisely.
 */
const scheduledFrames: FrameRequestCallback[] = [];
function flushFrames(maxCycles = 1): void {
  for (let i = 0; i < maxCycles; i++) {
    const frame = scheduledFrames.shift();
    if (!frame) return;
    frame(performance.now());
  }
}

/**
 * Active action handles — destroyed in `afterEach` so leftover
 * pointermove listeners from one test don't bleed into the next.
 */
const liveHandles: Array<{ destroy?: () => void }> = [];

/**
 * Wrap `cursorHalo` so every handle returned in a test is tracked and
 * auto-destroyed at teardown.
 */
function mountHalo(...args: Parameters<typeof import('./cursorHalo').cursorHalo>) {
  const handle = cursorHalo(...args);
  liveHandles.push(handle);
  return handle;
}

beforeEach(() => {
  mockedReducedMotion.mockReturnValue(false);
  originalMatchMedia = window.matchMedia;
  originalRAF = window.requestAnimationFrame;
  originalCAF = window.cancelAnimationFrame;
  patchMatchMedia(''); // Nothing matches by default — pointer-fine.
  scheduledFrames.length = 0;
  let nextId = 1;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    scheduledFrames.push(cb);
    return nextId++;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
});

afterEach(() => {
  // Tear down any actions still attached to window so listeners don't
  // leak across tests (e.g. a leftover pointermove handler firing during
  // a later "no listener should fire" assertion).
  while (liveHandles.length > 0) {
    const handle = liveHandles.pop();
    handle?.destroy?.();
  }
  window.matchMedia = originalMatchMedia;
  window.requestAnimationFrame = originalRAF;
  window.cancelAnimationFrame = originalCAF;
});

describe('cursorHalo — happy path (pointer-fine, motion enabled)', () => {
  it('writes --cx and --cy custom properties after a pointermove + RAF tick', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    mountHalo(node);

    // Dispatch a pointermove. The action schedules a RAF frame; flush it.
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 500, clientY: 400 }));
    flushFrames(50); // Run enough frames for the lerp to settle near target.

    // Final eased position should be near 50% / 50% (center).
    const cx = parseFloat(node.style.getPropertyValue('--cx'));
    const cy = parseFloat(node.style.getPropertyValue('--cy'));
    expect(cx).toBeGreaterThan(40);
    expect(cx).toBeLessThan(60);
    expect(cy).toBeGreaterThan(40);
    expect(cy).toBeLessThan(60);

    document.body.removeChild(node);
  });

  it('lerps toward the latest pointer position with the follow factor', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    mountHalo(node, { follow: 0.5 });

    // Move pointer to top-left corner.
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0 }));
    // One frame: lerp from 50/50 toward 0/0 by 0.5 → 25/25.
    flushFrames(1);
    const cxAfter1 = parseFloat(node.style.getPropertyValue('--cx'));
    const cyAfter1 = parseFloat(node.style.getPropertyValue('--cy'));
    expect(cxAfter1).toBeCloseTo(25, 0);
    expect(cyAfter1).toBeCloseTo(25, 0);

    // Another frame: 25 toward 0 by 0.5 → 12.5.
    flushFrames(1);
    const cxAfter2 = parseFloat(node.style.getPropertyValue('--cx'));
    expect(cxAfter2).toBeCloseTo(12.5, 1);

    document.body.removeChild(node);
  });

  it('uses default follow factor (0.18) when none provided', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });

    mountHalo(node);

    // Move pointer to top-left.
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0 }));
    // One frame at follow=0.18: 50 + (0 - 50) * 0.18 = 41.
    flushFrames(1);
    const cx = parseFloat(node.style.getPropertyValue('--cx'));
    expect(cx).toBeCloseTo(41, 0);

    document.body.removeChild(node);
  });

  it('destroy removes the pointermove listener and stops scheduling RAFs', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);

    const handle = mountHalo(node);

    // After destroy, dispatching pointermove must not push another frame.
    handle.destroy!();
    scheduledFrames.length = 0;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));
    expect(scheduledFrames.length).toBe(0);

    document.body.removeChild(node);
  });

  it('returns a destroy function (Svelte action contract)', () => {
    const node = document.createElement('div');

    const handle = mountHalo(node);

    expect(typeof handle.destroy).toBe('function');
  });
});

describe('cursorHalo — reduced-motion bypass', () => {
  beforeEach(() => {
    mockedReducedMotion.mockReturnValue(true);
  });

  it('does NOT attach a pointermove listener', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);

    mountHalo(node);

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));
    // No RAF was scheduled because the listener was never installed.
    expect(scheduledFrames.length).toBe(0);
    // No custom properties were written.
    expect(node.style.getPropertyValue('--cx')).toBe('');
    expect(node.style.getPropertyValue('--cy')).toBe('');

    document.body.removeChild(node);
  });

  it('returns a no-op destroy', () => {
    const node = document.createElement('div');

    const handle = mountHalo(node);

    expect(typeof handle.destroy).toBe('function');
    expect(() => handle.destroy!()).not.toThrow();
  });
});

describe('cursorHalo — pointer-coarse no-op', () => {
  beforeEach(() => {
    patchMatchMedia('(pointer: coarse)');
  });

  it('does NOT attach a pointermove listener on touch devices', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);

    mountHalo(node);

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 100 }));
    expect(scheduledFrames.length).toBe(0);
    expect(node.style.getPropertyValue('--cx')).toBe('');

    document.body.removeChild(node);
  });

  it('returns a no-op destroy', () => {
    const node = document.createElement('div');

    const handle = mountHalo(node);

    expect(typeof handle.destroy).toBe('function');
    expect(() => handle.destroy!()).not.toThrow();
  });
});
