/**
 * @fileoverview Contract tests for ScanCard — the chrome wrapper for
 * tool-call scans (spec §5, plan Task 5).
 *
 * The component composes HudPanel + StatusPill + SysLabel to render
 * a header row ({toolName} + status pill) above caller-supplied
 * children. Tests assert structural contracts:
 *   - header text + status pill render
 *   - statusTone forwards to StatusPill
 *   - ticks prop forwards to HudPanel
 *   - errorGlyph renders `!` and suppresses ticks
 *   - children render below the header
 *
 * Phase 1 contract is purely structural — no motion.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ScanCardHost from './ScanCard.test-host.svelte';

afterEach(() => {
  cleanup();
});

describe('ScanCard', () => {
  it('renders the toolName in a sys-voice header', () => {
    const { container } = render(ScanCardHost, {
      props: { toolName: 'GREP_DOC', status: 'SCANNING' }
    });
    expect(container.textContent).toContain('GREP_DOC');
    // SysLabel kind="header" emits the `//` prefix.
    expect(container.textContent).toContain('//');
  });

  it('renders the status inside a status pill', () => {
    const { container } = render(ScanCardHost, {
      props: { toolName: 'GREP_DOC', status: 'SCANNING' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent?.trim()).toBe('[ SCANNING ]');
  });

  it('forwards statusTone to the status pill (alarm)', () => {
    const { container } = render(ScanCardHost, {
      props: { toolName: 'GREP_DOC', status: 'FAULTED', statusTone: 'alarm' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.classList.contains('status-pill--alarm')).toBe(true);
  });

  it('forwards statusTone to the status pill (dim)', () => {
    const { container } = render(ScanCardHost, {
      props: { toolName: 'GREP_DOC', status: 'HALTED', statusTone: 'dim' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.classList.contains('status-pill--dim')).toBe(true);
  });

  it('wraps content in a HudPanel', () => {
    const { container } = render(ScanCardHost, {
      props: { toolName: 'GREP_DOC', status: 'SCANNING' }
    });
    expect(container.querySelector('.hud-panel')).not.toBeNull();
  });

  it('omits the +++ tick cluster by default', () => {
    const { container } = render(ScanCardHost, {
      props: { toolName: 'GREP_DOC', status: 'SCANNING' }
    });
    expect(container.querySelector('.hud-panel__ticks')).toBeNull();
  });

  it('renders the +++ tick cluster when ticks is true', () => {
    const { container } = render(ScanCardHost, {
      props: { toolName: 'GREP_DOC', status: 'SCANNING', ticks: true }
    });
    expect(container.querySelector('.hud-panel__ticks')).not.toBeNull();
  });

  it('renders the children below the header', () => {
    const { getByTestId, container } = render(ScanCardHost, {
      props: { toolName: 'GREP_DOC', status: 'SCANNING' }
    });
    const child = getByTestId('scan-child');
    expect(child.textContent).toBe('interior');
    // child is inside the panel
    expect(child.closest('.hud-panel')).not.toBeNull();
    // header text appears before the child in document order
    const cardText = container.textContent ?? '';
    expect(cardText.indexOf('GREP_DOC')).toBeLessThan(cardText.indexOf('interior'));
  });

  it('renders an error glyph when errorGlyph is true', () => {
    const { container } = render(ScanCardHost, {
      props: { toolName: 'GREP_DOC', status: 'FAULTED', errorGlyph: true }
    });
    const glyph = container.querySelector('.scan-card__error-glyph');
    expect(glyph).not.toBeNull();
    expect(glyph!.textContent).toContain('!');
  });

  it('errorGlyph replaces ticks when both are set', () => {
    const { container } = render(ScanCardHost, {
      props: { toolName: 'GREP_DOC', status: 'FAULTED', ticks: true, errorGlyph: true }
    });
    // ticks are suppressed in favor of the error glyph
    expect(container.querySelector('.hud-panel__ticks')).toBeNull();
    expect(container.querySelector('.scan-card__error-glyph')).not.toBeNull();
  });
});
