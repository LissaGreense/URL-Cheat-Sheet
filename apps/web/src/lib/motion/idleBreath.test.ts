/**
 * @fileoverview Contract tests for the `idleBreath` Svelte action.
 *
 * Pure CSS effect — no GSAP. The action adds a class on mount; that
 * class is wired to an `@keyframes idle-breath` rule (in
 * `atmosphere.css`) that yoyo-scales 1.0 → scaleTo → 1.0. Animation
 * duration + `--idle-breath-scale-to` are written as custom properties
 * so the keyframe can read them.
 *
 * We assert that:
 *   1. The class is added on mount.
 *   2. The duration + scaleTo custom properties are set with the
 *      defaults (8000ms, 1.04) when no params are given.
 *   3. Custom params flow through to the custom properties.
 *   4. Under reduced motion, no class is added and no custom properties
 *      are written.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_reducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => false)
}));

import { idleBreath, IDLE_BREATH_CLASS } from './idleBreath';
import { prefersReducedMotion } from './_reducedMotion';

const mockedReducedMotion = vi.mocked(prefersReducedMotion);

beforeEach(() => {
  mockedReducedMotion.mockReturnValue(false);
});

describe('idleBreath — happy path (motion enabled)', () => {
  it('adds the idle-breath class on mount', () => {
    const node = document.createElement('div');

    idleBreath(node);

    expect(node.classList.contains(IDLE_BREATH_CLASS)).toBe(true);
  });

  it('sets default duration (8000ms) on a CSS custom property', () => {
    const node = document.createElement('div');

    idleBreath(node);

    expect(node.style.getPropertyValue('--idle-breath-duration')).toBe('8000ms');
  });

  it('sets default scaleTo (1.04) on a CSS custom property', () => {
    const node = document.createElement('div');

    idleBreath(node);

    expect(node.style.getPropertyValue('--idle-breath-scale-to')).toBe('1.04');
  });

  it('respects custom scaleTo + duration params', () => {
    const node = document.createElement('div');

    idleBreath(node, { scaleTo: 1.08, duration: 12000 });

    expect(node.style.getPropertyValue('--idle-breath-duration')).toBe('12000ms');
    expect(node.style.getPropertyValue('--idle-breath-scale-to')).toBe('1.08');
  });

  it('returns a destroy function (Svelte action contract)', () => {
    const node = document.createElement('div');

    const handle = idleBreath(node);

    expect(typeof handle.destroy).toBe('function');
  });

  it('destroy removes the idle-breath class', () => {
    const node = document.createElement('div');

    const handle = idleBreath(node);
    expect(node.classList.contains(IDLE_BREATH_CLASS)).toBe(true);

    handle.destroy!();
    expect(node.classList.contains(IDLE_BREATH_CLASS)).toBe(false);
  });
});

describe('idleBreath — reduced-motion bypass', () => {
  beforeEach(() => {
    mockedReducedMotion.mockReturnValue(true);
  });

  it('does NOT add the idle-breath class', () => {
    const node = document.createElement('div');

    idleBreath(node);

    expect(node.classList.contains(IDLE_BREATH_CLASS)).toBe(false);
  });

  it('does NOT write any custom properties', () => {
    const node = document.createElement('div');

    idleBreath(node);

    expect(node.style.getPropertyValue('--idle-breath-duration')).toBe('');
    expect(node.style.getPropertyValue('--idle-breath-scale-to')).toBe('');
  });

  it('returns a no-op destroy that does not throw', () => {
    const node = document.createElement('div');

    const handle = idleBreath(node);

    expect(typeof handle.destroy).toBe('function');
    expect(() => handle.destroy!()).not.toThrow();
  });
});
