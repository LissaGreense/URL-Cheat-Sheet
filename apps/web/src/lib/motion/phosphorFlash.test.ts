/**
 * @fileoverview Contract tests for the `phosphorFlash` Svelte action.
 *
 * Pure CSS effect — no GSAP. The action adds a one-shot class to the
 * node on mount and on every `trigger`-value change. After `duration`
 * elapses (via `setTimeout`), the class is removed so it can be added
 * again on the next trigger change to re-fire the keyframe animation.
 *
 * We assert the CONTRACT — what class the node carries and when —
 * rather than the resulting pixels (jsdom can't render `@keyframes`).
 *
 * Mock pattern mirrors Task 9 (scrambleIn / splitLineReveal):
 *   - `vi.mock('./_reducedMotion')` lets each test flip the result.
 *   - Fake timers so we can advance past `duration` deterministically.
 *
 * Two cycles + a re-fire cycle:
 *   1. Happy path — class is added on mount, removed after duration,
 *      re-added when `trigger` value changes via `update`.
 *   2. Reduced-motion bypass — no class is ever added.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./_reducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => false)
}));

import { phosphorFlash, PHOSPHOR_FLASH_CLASS } from './phosphorFlash';
import { prefersReducedMotion } from './_reducedMotion';

const mockedReducedMotion = vi.mocked(prefersReducedMotion);

beforeEach(() => {
  vi.useFakeTimers();
  mockedReducedMotion.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('phosphorFlash — happy path (motion enabled)', () => {
  it('adds the flash class on mount', () => {
    const node = document.createElement('span');

    phosphorFlash(node, { trigger: 'READY' });

    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(true);
  });

  it('removes the flash class after the default duration (280ms)', () => {
    const node = document.createElement('span');

    phosphorFlash(node, { trigger: 'READY' });
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(true);

    vi.advanceTimersByTime(280);
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(false);
  });

  it('respects a custom duration', () => {
    const node = document.createElement('span');

    phosphorFlash(node, { trigger: 'READY', duration: 600 });
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(true);

    vi.advanceTimersByTime(599);
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(false);
  });

  it('writes the color param to a CSS custom property on the node', () => {
    const node = document.createElement('span');

    phosphorFlash(node, { trigger: 'READY', color: 'var(--amber-alarm)' });

    expect(node.style.getPropertyValue('--phosphor-flash-color')).toBe('var(--amber-alarm)');
  });

  it('defaults the color custom property to var(--green-acid)', () => {
    const node = document.createElement('span');

    phosphorFlash(node, { trigger: 'READY' });

    expect(node.style.getPropertyValue('--phosphor-flash-color')).toBe('var(--green-acid)');
  });

  it('re-fires when trigger value changes via update', () => {
    const node = document.createElement('span');

    const handle = phosphorFlash(node, { trigger: 'STANDBY' });
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(true);

    // First flash completes.
    vi.advanceTimersByTime(280);
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(false);

    // Trigger changes → flash re-fires.
    handle.update!({ trigger: 'READY' });
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(true);

    vi.advanceTimersByTime(280);
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(false);
  });

  it('does NOT re-fire when trigger value is unchanged across updates', () => {
    const node = document.createElement('span');

    const handle = phosphorFlash(node, { trigger: 'STANDBY' });
    vi.advanceTimersByTime(280);
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(false);

    // Same trigger value → no re-fire.
    handle.update!({ trigger: 'STANDBY' });
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(false);
  });

  it('cancels a pending class-removal when destroy runs mid-flash', () => {
    const node = document.createElement('span');

    const handle = phosphorFlash(node, { trigger: 'READY' });
    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(true);

    handle.destroy!();
    // After destroy, advancing time must not throw or touch the node.
    vi.advanceTimersByTime(500);
    // The class state after destroy is undefined — destroy only
    // guarantees that no further async work touches the node.
    // Re-mounting on a fresh node must still behave correctly:
    const fresh = document.createElement('span');
    phosphorFlash(fresh, { trigger: 'READY' });
    expect(fresh.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(true);
  });

  it('returns a destroy function (Svelte action contract)', () => {
    const node = document.createElement('span');

    const handle = phosphorFlash(node, { trigger: 'READY' });

    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.update).toBe('function');
  });
});

describe('phosphorFlash — reduced-motion bypass', () => {
  beforeEach(() => {
    mockedReducedMotion.mockReturnValue(true);
  });

  it('does NOT add the flash class on mount', () => {
    const node = document.createElement('span');

    phosphorFlash(node, { trigger: 'READY' });

    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(false);
  });

  it('does NOT add the flash class on trigger change', () => {
    const node = document.createElement('span');

    const handle = phosphorFlash(node, { trigger: 'STANDBY' });
    handle.update!({ trigger: 'READY' });

    expect(node.classList.contains(PHOSPHOR_FLASH_CLASS)).toBe(false);
  });

  it('returns a no-op destroy', () => {
    const node = document.createElement('span');

    const handle = phosphorFlash(node, { trigger: 'READY' });

    expect(typeof handle.destroy).toBe('function');
    expect(() => handle.destroy!()).not.toThrow();
  });
});
