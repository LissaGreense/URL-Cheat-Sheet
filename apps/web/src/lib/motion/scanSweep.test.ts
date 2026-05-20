/**
 * @fileoverview Contract tests for the `scanSweep` Svelte action.
 *
 * GSAP visual effects are unobservable under jsdom (no RAF, no layout).
 * We mock `gsap` + `gsap/CustomEase` and assert the CALL CONTRACT —
 * the shape of the timeline / tween calls `scanSweep` issues — not the
 * resulting pixels.
 *
 * Mock pattern mirrors Task 9 (`scrambleIn` / `splitLineReveal`):
 *   - `vi.mock('gsap', ...)` returns a frozen mock with `to`, `timeline`,
 *     and `set` spies. The `timeline()` call returns a chainable mock
 *     with `to`, `set`, and `kill` spies on it.
 *   - `vi.mock('./_reducedMotion', ...)` lets each test flip the result.
 *
 * Four cycles:
 *   1. Happy path — mount with `trigger=scanning` schedules a GSAP
 *      timeline on the `.scan-sweep__line` child with `top: 0% → 100%`
 *      and an opacity curve peaking mid-traversal. The duration defaults
 *      to 600ms (→ 0.6s after the ms→s conversion).
 *   2. Trigger re-fire — on `update` with a new trigger value, the
 *      previous timeline is killed and a new one scheduled.
 *   3. Reduced-motion bypass — no timeline scheduled, no GSAP calls.
 *   4. Missing scanline child — the action no-ops gracefully when the
 *      `.scan-sweep__line` selector matches nothing (defensive — the
 *      action must not crash if a future template change removes the
 *      child).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { gsapMock, timelineMock } = vi.hoisted(() => {
  // The chainable timeline handle the action stores so it can `kill()`
  // the previous one when the trigger changes. Methods return the same
  // object so chains like `tl.to(...).to(...)` work.
  const tl: {
    to: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
  } = {
    to: vi.fn(),
    set: vi.fn(),
    kill: vi.fn()
  };
  tl.to.mockReturnValue(tl);
  tl.set.mockReturnValue(tl);

  return {
    timelineMock: tl,
    gsapMock: {
      to: vi.fn(),
      from: vi.fn(),
      set: vi.fn(),
      timeline: vi.fn(() => tl),
      registerPlugin: vi.fn(),
      ticker: { add: vi.fn(), remove: vi.fn() }
    }
  };
});

vi.mock('gsap', () => ({ default: gsapMock, gsap: gsapMock }));
vi.mock('gsap/CustomEase', () => ({
  CustomEase: { create: vi.fn(), name: 'CustomEase' }
}));

vi.mock('./_reducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => false)
}));

import { scanSweep } from './scanSweep';
import { prefersReducedMotion } from './_reducedMotion';

const mockedReducedMotion = vi.mocked(prefersReducedMotion);

/**
 * Build a host node with a `.scan-sweep__line` child. The action
 * targets the child via `node.querySelector('.scan-sweep__line')`.
 */
function makeHostWithScanline(): { host: HTMLElement; scanline: HTMLElement } {
  const host = document.createElement('div');
  const scanline = document.createElement('div');
  scanline.classList.add('scan-sweep__line');
  host.appendChild(scanline);
  return { host, scanline };
}

beforeEach(() => {
  gsapMock.to.mockClear();
  gsapMock.set.mockClear();
  gsapMock.timeline.mockClear();
  timelineMock.to.mockClear();
  timelineMock.set.mockClear();
  timelineMock.kill.mockClear();
  mockedReducedMotion.mockReturnValue(false);
});

describe('scanSweep — happy path (motion enabled)', () => {
  it('schedules a GSAP timeline on the .scan-sweep__line child on mount', () => {
    const { host, scanline } = makeHostWithScanline();

    scanSweep(host, { trigger: 'scanning' });

    // A timeline was created exactly once.
    expect(gsapMock.timeline).toHaveBeenCalledTimes(1);

    // The timeline drove at least one tween targeting the scanline node.
    expect(timelineMock.to).toHaveBeenCalled();
    const calls = timelineMock.to.mock.calls;
    for (const [target] of calls) {
      expect(target).toBe(scanline);
    }
  });

  it('seeds the scanline at top: 0% / opacity: 0 before the sweep starts', () => {
    const { host, scanline } = makeHostWithScanline();

    scanSweep(host, { trigger: 'scanning' });

    // The very first thing the timeline does is `set` the scanline to
    // top: 0% + opacity: 0 so re-triggers always start from the top.
    expect(timelineMock.set).toHaveBeenCalled();
    const [target, vars] = timelineMock.set.mock.calls[0]!;
    expect(target).toBe(scanline);
    expect(vars).toMatchObject({ top: '0%', opacity: 0 });
  });

  it('animates top: 100% with the default 600ms (=0.6s) duration', () => {
    const { host } = makeHostWithScanline();

    scanSweep(host, { trigger: 'scanning' });

    // Find the tween targeting `top: '100%'`. The action runs an
    // opacity timeline too; we assert on the descent tween here.
    const descent = timelineMock.to.mock.calls.find(
      ([, vars]) => (vars as { top?: string }).top === '100%'
    );
    expect(descent).toBeDefined();
    const [, vars] = descent!;
    expect((vars as { duration: number }).duration).toBeCloseTo(0.6);
  });

  it('uses the --ease-out-expo cubic-bezier on the descent tween', () => {
    const { host } = makeHostWithScanline();

    scanSweep(host, { trigger: 'scanning' });

    const descent = timelineMock.to.mock.calls.find(
      ([, vars]) => (vars as { top?: string }).top === '100%'
    );
    expect(descent).toBeDefined();
    const [, vars] = descent!;
    // Spec §3.1 — cubic-bezier(0.16, 1, 0.3, 1).
    expect((vars as { ease: string }).ease).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  });

  it('runs an opacity timeline peaking at 0.9 mid-traversal then fading to 0.4', () => {
    const { host } = makeHostWithScanline();

    scanSweep(host, { trigger: 'scanning' });

    // The opacity curve is driven via GSAP's `keyframes` syntax so the
    // line passes through 0 → 0.9 (peak) → 0.4 (final) inside the same
    // descent span. The set() call already pinned opacity to 0, so the
    // keyframes start there and rise to the values asserted below.
    const opacityKeyframes = timelineMock.to.mock.calls
      .map(([, vars]) => (vars as { keyframes?: Array<{ opacity?: number }> }).keyframes)
      .find((kf): kf is Array<{ opacity?: number }> => Array.isArray(kf));
    expect(opacityKeyframes).toBeDefined();
    const opacityValues = opacityKeyframes!
      .map((frame) => frame.opacity)
      .filter((v): v is number => typeof v === 'number');
    expect(opacityValues).toContain(0.9);
    expect(opacityValues).toContain(0.4);
  });

  it('respects a custom duration param', () => {
    const { host } = makeHostWithScanline();

    scanSweep(host, { trigger: 'scanning', duration: 1200 });

    const descent = timelineMock.to.mock.calls.find(
      ([, vars]) => (vars as { top?: string }).top === '100%'
    );
    expect(descent).toBeDefined();
    const [, vars] = descent!;
    expect((vars as { duration: number }).duration).toBeCloseTo(1.2);
  });

  it('returns destroy + update handles (Svelte action contract)', () => {
    const { host } = makeHostWithScanline();

    const handle = scanSweep(host, { trigger: 'scanning' });

    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.update).toBe('function');
  });
});

describe('scanSweep — trigger re-fire', () => {
  it('kills the previous timeline and schedules a new one when trigger changes', () => {
    const { host } = makeHostWithScanline();

    const handle = scanSweep(host, { trigger: 'scanning' });
    expect(gsapMock.timeline).toHaveBeenCalledTimes(1);

    handle.update!({ trigger: 'rescanning' });
    expect(timelineMock.kill).toHaveBeenCalledTimes(1);
    expect(gsapMock.timeline).toHaveBeenCalledTimes(2);
  });

  it('does NOT re-fire when trigger value is unchanged across updates', () => {
    const { host } = makeHostWithScanline();

    const handle = scanSweep(host, { trigger: 'scanning' });
    handle.update!({ trigger: 'scanning' });

    expect(gsapMock.timeline).toHaveBeenCalledTimes(1);
    expect(timelineMock.kill).not.toHaveBeenCalled();
  });

  it('kills the active timeline on destroy', () => {
    const { host } = makeHostWithScanline();

    const handle = scanSweep(host, { trigger: 'scanning' });
    handle.destroy!();
    expect(timelineMock.kill).toHaveBeenCalledTimes(1);
  });
});

describe('scanSweep — reduced-motion bypass', () => {
  beforeEach(() => {
    mockedReducedMotion.mockReturnValue(true);
  });

  it('does NOT schedule any GSAP timeline', () => {
    const { host } = makeHostWithScanline();

    scanSweep(host, { trigger: 'scanning' });

    expect(gsapMock.timeline).not.toHaveBeenCalled();
    expect(timelineMock.to).not.toHaveBeenCalled();
  });

  it('hides the scanline (opacity:0) so no flash of unstyled motion paints', () => {
    const { host, scanline } = makeHostWithScanline();

    scanSweep(host, { trigger: 'scanning' });

    // The action sets inline opacity 0 so even if the CSS leaves the
    // scanline at full opacity, reduced-motion users never see it.
    expect(scanline.style.opacity).toBe('0');
  });

  it('returns a no-op update + destroy', () => {
    const { host } = makeHostWithScanline();

    const handle = scanSweep(host, { trigger: 'scanning' });

    expect(typeof handle.update).toBe('function');
    expect(typeof handle.destroy).toBe('function');
    handle.update!({ trigger: 'rescanning' });
    handle.destroy!();
    expect(gsapMock.timeline).not.toHaveBeenCalled();
  });
});

describe('scanSweep — mount-fire suppression on nullish trigger', () => {
  it('does NOT fire the sweep on mount when trigger is null', () => {
    const { host } = makeHostWithScanline();

    scanSweep(host, { trigger: null });

    expect(gsapMock.timeline).not.toHaveBeenCalled();
  });

  it('does NOT fire the sweep on mount when trigger is undefined', () => {
    const { host } = makeHostWithScanline();

    scanSweep(host, { trigger: undefined });

    expect(gsapMock.timeline).not.toHaveBeenCalled();
  });

  it('fires the sweep when trigger transitions from null to a real value', () => {
    const { host } = makeHostWithScanline();

    const handle = scanSweep(host, { trigger: null });
    expect(gsapMock.timeline).not.toHaveBeenCalled();

    handle.update!({ trigger: 'active' });
    expect(gsapMock.timeline).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when trigger transitions back to null mid-scan', () => {
    const { host } = makeHostWithScanline();

    const handle = scanSweep(host, { trigger: 'active' });
    expect(gsapMock.timeline).toHaveBeenCalledTimes(1);

    handle.update!({ trigger: null });
    // No additional sweep fired; the previous timeline still exists
    // (no `kill` was called either, since we only kill on a NEW sweep).
    expect(gsapMock.timeline).toHaveBeenCalledTimes(1);
  });
});

describe('scanSweep — defensive: missing scanline child', () => {
  it('no-ops when the host has no .scan-sweep__line descendant', () => {
    const host = document.createElement('div'); // no child

    const handle = scanSweep(host, { trigger: 'scanning' });

    expect(gsapMock.timeline).not.toHaveBeenCalled();
    // Returns a handle so Svelte's action contract stays intact.
    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.update).toBe('function');
    // And nothing throws on subsequent updates / destroy.
    expect(() => handle.update!({ trigger: 'rescanning' })).not.toThrow();
    expect(() => handle.destroy!()).not.toThrow();
  });
});
