/**
 * @fileoverview Contract tests for StatusPill — the bracketed status
 * pill from spec §2.4 / plan Task 2.
 *
 * The pill wraps a state string in `[ ]` brackets (the canonical
 * instrumentation form) and renders in sys-voice typography. The `tone`
 * prop maps to a class flag (asserted via classList — jsdom strips
 * scoped-CSS colors so we can't check `getComputedStyle('color')`
 * reliably; the class flag is the durable contract).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import StatusPill from './StatusPill.svelte';

afterEach(() => {
  cleanup();
});

describe('StatusPill', () => {
  it('wraps the state string in [ ] brackets', () => {
    const { container } = render(StatusPill, { props: { state: 'READY' } });
    const pill = container.querySelector('.status-pill');
    expect(pill).not.toBeNull();
    // The visible text is "[ READY ]" — exact match (single spaces inside).
    expect(pill!.textContent?.trim()).toBe('[ READY ]');
  });

  it('passes the state through verbatim (case preserved)', () => {
    const { container } = render(StatusPill, { props: { state: 'SCANNING' } });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ SCANNING ]');
  });

  it('renders the normal tone by default', () => {
    const { container } = render(StatusPill, { props: { state: 'READY' } });
    const pill = container.querySelector('.status-pill');
    expect(pill!.classList.contains('status-pill--alarm')).toBe(false);
    expect(pill!.classList.contains('status-pill--dim')).toBe(false);
  });

  it('applies the alarm tone class when tone is "alarm"', () => {
    const { container } = render(StatusPill, {
      props: { state: 'HALTED', tone: 'alarm' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.classList.contains('status-pill--alarm')).toBe(true);
    expect(pill!.classList.contains('status-pill--dim')).toBe(false);
  });

  it('applies the dim tone class when tone is "dim"', () => {
    const { container } = render(StatusPill, {
      props: { state: 'STANDBY', tone: 'dim' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.classList.contains('status-pill--dim')).toBe(true);
    expect(pill!.classList.contains('status-pill--alarm')).toBe(false);
  });

  it('renders as a <span> (inline, can sit alongside text)', () => {
    const { container } = render(StatusPill, { props: { state: 'READY' } });
    const pill = container.querySelector('.status-pill');
    expect(pill!.tagName).toBe('SPAN');
  });
});
