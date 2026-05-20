/**
 * @fileoverview Contract tests for HudPanel — the chrome wrapper from
 * spec §2.4 / plan Task 2.
 *
 * The component renders:
 *   - children inside `.hud-panel`
 *   - conditional `[ ]` corner brackets (default ON, controlled by `corners`)
 *   - conditional `+++` tick cluster (default OFF, controlled by `ticks`)
 *   - alarm variant tints the border via a class flag
 *
 * Phase 1 contract is purely structural — no motion. Visual chrome
 * (border color, backdrop-filter, background) lives in scoped CSS;
 * jsdom strips Svelte-scoped styles, so tests assert on markup
 * (classes, conditional element presence, text content), not on
 * `getComputedStyle`.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import HudPanelHost from './HudPanel.test-host.svelte';

afterEach(() => {
  cleanup();
});

describe('HudPanel', () => {
  it('renders children inside the panel root', () => {
    const { getByTestId, container } = render(HudPanelHost);
    const child = getByTestId('hud-child');
    expect(child.textContent).toBe('payload');
    expect(child.closest('.hud-panel')).not.toBeNull();
    expect(container.querySelector('.hud-panel')).not.toBeNull();
  });

  it('renders [ ] corner brackets by default (corners ON)', () => {
    const { container } = render(HudPanelHost);
    expect(container.querySelector('.hud-panel__corner--tl')).not.toBeNull();
    expect(container.querySelector('.hud-panel__corner--tr')).not.toBeNull();
    expect(container.querySelector('.hud-panel__corner--bl')).not.toBeNull();
    expect(container.querySelector('.hud-panel__corner--br')).not.toBeNull();
  });

  it('omits corner brackets when corners is false', () => {
    const { container } = render(HudPanelHost, { props: { corners: false } });
    expect(container.querySelector('.hud-panel__corner--tl')).toBeNull();
    expect(container.querySelector('.hud-panel__corner--tr')).toBeNull();
    expect(container.querySelector('.hud-panel__corner--bl')).toBeNull();
    expect(container.querySelector('.hud-panel__corner--br')).toBeNull();
  });

  it('omits the +++ tick cluster by default (ticks OFF)', () => {
    const { container } = render(HudPanelHost);
    expect(container.querySelector('.hud-panel__ticks')).toBeNull();
  });

  it('renders the +++ tick cluster when ticks is true', () => {
    const { container } = render(HudPanelHost, { props: { ticks: true } });
    const ticks = container.querySelector('.hud-panel__ticks');
    expect(ticks).not.toBeNull();
    expect(ticks!.textContent).toContain('+++');
  });

  it('applies the alarm variant class when variant is "alarm"', () => {
    const { container } = render(HudPanelHost, { props: { variant: 'alarm' } });
    const panel = container.querySelector('.hud-panel');
    expect(panel).not.toBeNull();
    expect(panel!.classList.contains('hud-panel--alarm')).toBe(true);
  });

  it('does not apply the alarm variant class by default', () => {
    const { container } = render(HudPanelHost);
    const panel = container.querySelector('.hud-panel');
    expect(panel!.classList.contains('hud-panel--alarm')).toBe(false);
  });
});
