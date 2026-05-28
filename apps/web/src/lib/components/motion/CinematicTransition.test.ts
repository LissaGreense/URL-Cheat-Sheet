/**
 * @fileoverview Contract tests for the `CinematicTransition` Svelte
 * component (plan Task 13, spec §4.2 — the "memory load" moment).
 *
 * jsdom cannot run a real GSAP timeline (no RAF + no layout), so we mock
 * `gsap.timeline()` to return a stub whose `onComplete` callback we drive
 * synchronously. The contract under test is:
 *
 *   1. Happy path (motion enabled):
 *      - On mount, the component builds a single GSAP timeline.
 *      - The timeline is configured with `onComplete` wired to the
 *        component's `onComplete` prop.
 *      - When we manually invoke that captured `onComplete` (simulating
 *        the timeline finishing), the prop fires.
 *      - The timeline schedules the three load-bearing beats — a `.to`
 *        on the bar, panel, and chat surface elements (we don't assert
 *        pixel values, only that the timeline was populated).
 *
 *   2. Reduced-motion bypass (ADR 0009 strict fallback):
 *      - No timeline is created. `gsap.timeline` is NOT called.
 *      - `onComplete` fires synchronously on mount.
 *
 * The mock pattern mirrors `splitLineReveal.test.ts` / `scanSweep.test.ts`
 * — `vi.hoisted` so the mock survives the import-hoisting dance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';

// Hoisted mocks. The timeline stub captures the `onComplete` callback so
// the test can fire it manually; the `.to`/`.set` methods are chainable
// no-ops that record their calls for the "timeline was populated" assert.
const { gsapMock, timelineStub } = vi.hoisted(() => {
  let capturedOnComplete: (() => void) | null = null;
  const stub = {
    to: vi.fn(),
    set: vi.fn(),
    from: vi.fn(),
    kill: vi.fn(),
    /**
     * Exposed so the test can simulate "timeline finished" without
     * actually waiting for GSAP RAF (which doesn't run under jsdom).
     */
    __fireOnComplete: () => {
      if (capturedOnComplete !== null) capturedOnComplete();
    },
    /**
     * Reset between tests — the timeline stub is module-scoped.
     */
    __reset: () => {
      capturedOnComplete = null;
    }
  };
  // Chainable methods return `stub` itself so `tl.to(...).to(...)` works.
  stub.to.mockImplementation(() => stub);
  stub.set.mockImplementation(() => stub);
  stub.from.mockImplementation(() => stub);

  const timelineFactory = vi.fn((opts?: { onComplete?: () => void }) => {
    capturedOnComplete = opts?.onComplete ?? null;
    return stub;
  });

  return {
    gsapMock: {
      to: vi.fn(),
      from: vi.fn(),
      set: vi.fn(),
      timeline: timelineFactory,
      registerPlugin: vi.fn(),
      ticker: { add: vi.fn(), remove: vi.fn() }
    },
    timelineStub: stub
  };
});

vi.mock('gsap', () => ({ default: gsapMock, gsap: gsapMock }));

// The component imports the reduced-motion helper to gate the timeline.
vi.mock('../../motion/_reducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => false)
}));

import CinematicTransition from './CinematicTransition.svelte';
import { prefersReducedMotion } from '../../motion/_reducedMotion';

const mockedReducedMotion = vi.mocked(prefersReducedMotion);

beforeEach(() => {
  gsapMock.timeline.mockClear();
  timelineStub.to.mockClear();
  timelineStub.set.mockClear();
  timelineStub.from.mockClear();
  timelineStub.kill.mockClear();
  timelineStub.__reset();
  mockedReducedMotion.mockReturnValue(false);
  cleanup();
});

describe('CinematicTransition — happy path (motion enabled)', () => {
  it('creates a GSAP timeline on mount with onComplete wired to the prop', async () => {
    const onComplete = vi.fn();

    render(CinematicTransition, {
      props: { from: 'extracting', to: 'ready', onComplete }
    });
    await tick();

    expect(gsapMock.timeline).toHaveBeenCalledTimes(1);
    // The factory was called with `{ onComplete: <fn> }` — that captured
    // callback is what eventually fires the prop. The timelineStub
    // records the callback via `__fireOnComplete`.
    expect(timelineStub.to.mock.calls.length).toBeGreaterThan(0);
  });

  it('populates the timeline with at least three tweens (bar, panel, chat)', async () => {
    render(CinematicTransition, {
      props: { from: 'extracting', to: 'ready', onComplete: () => {} }
    });
    await tick();

    // Bar grow + panel collapse + chat materialize = three tweens.
    // We assert ≥3 to leave room for fine-tuning the choreography
    // without rewriting this contract.
    expect(timelineStub.to.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('fires onComplete only when the timeline finishes (not synchronously)', async () => {
    const onComplete = vi.fn();

    render(CinematicTransition, {
      props: { from: 'extracting', to: 'ready', onComplete }
    });
    await tick();

    // Right after mount, the timeline has been scheduled but the prop
    // callback has NOT been called yet — GSAP would normally drive it
    // via RAF after ~1600ms.
    expect(onComplete).not.toHaveBeenCalled();

    // Simulate "timeline finished" by invoking the captured callback.
    timelineStub.__fireOnComplete();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('renders an overlay element with the cinematic-transition class', async () => {
    const { container } = render(CinematicTransition, {
      props: { from: 'extracting', to: 'ready', onComplete: () => {} }
    });
    await tick();

    expect(container.querySelector('.cinematic-transition')).not.toBeNull();
  });
});

describe('CinematicTransition — completion fallback (GSAP onComplete never fires)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Restore real timers so the reduced-motion suite (which relies on
    // microtask `tick()` flushing) isn't poisoned by the fake clock.
    vi.useRealTimers();
  });

  it('fires onComplete via a bounded fallback timer when the timeline never completes', async () => {
    const onComplete = vi.fn();

    render(CinematicTransition, {
      props: { from: 'extracting', to: 'ready', onComplete }
    });
    await tick();

    // Simulate a throttled/paused RAF (e.g. background tab): GSAP's
    // captured `onComplete` is NEVER invoked. The user must still
    // advance to `ready` — the fallback timer is the only thing that
    // can unstick them.
    expect(onComplete).not.toHaveBeenCalled();

    // Advance past the cinematic duration + buffer. The fallback must
    // have force-fired `onComplete` by now.
    vi.advanceTimersByTime(2000);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not double-fire when both the timeline and the fallback would complete', async () => {
    const onComplete = vi.fn();

    render(CinematicTransition, {
      props: { from: 'extracting', to: 'ready', onComplete }
    });
    await tick();

    // GSAP's timeline finishes normally first…
    timelineStub.__fireOnComplete();
    expect(onComplete).toHaveBeenCalledTimes(1);

    // …then the fallback window elapses. It must NOT fire a second time.
    vi.advanceTimersByTime(2000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('CinematicTransition — reduced-motion bypass', () => {
  beforeEach(() => {
    mockedReducedMotion.mockReturnValue(true);
  });

  it('does NOT create a GSAP timeline', async () => {
    render(CinematicTransition, {
      props: { from: 'extracting', to: 'ready', onComplete: () => {} }
    });
    await tick();

    expect(gsapMock.timeline).not.toHaveBeenCalled();
  });

  it('fires onComplete synchronously on mount (no animation scheduled)', async () => {
    const onComplete = vi.fn();

    render(CinematicTransition, {
      props: { from: 'extracting', to: 'ready', onComplete }
    });
    // A single `tick()` flush is enough — the component's onMount runs
    // synchronously, fires `onComplete`, and returns. We're NOT waiting
    // for any timer.
    await tick();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
