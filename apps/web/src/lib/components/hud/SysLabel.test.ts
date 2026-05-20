/**
 * @fileoverview Contract tests for SysLabel — the `// HEADER` /
 * `> action` voice helpers from spec §2.4.
 *
 * Both forms render sys-voice typography (spec §2.2) — body family,
 * 10-12px caps, wide tracking. The visible distinction is the prefix
 * glyph plus a single space separator (e.g. `// MEMORY_BANK`,
 * `> INGEST`).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import SysLabelHost from './SysLabel.test-host.svelte';

afterEach(() => {
  cleanup();
});

describe('SysLabel', () => {
  it('prefixes header content with "//"', () => {
    const { container } = render(SysLabelHost, {
      props: { kind: 'header', text: 'MEMORY_BANK' }
    });
    const label = container.querySelector('.sys-label');
    expect(label).not.toBeNull();
    expect(label!.textContent?.trim()).toBe('// MEMORY_BANK');
  });

  it('prefixes action content with ">"', () => {
    const { container } = render(SysLabelHost, {
      props: { kind: 'action', text: 'INGEST' }
    });
    const label = container.querySelector('.sys-label');
    expect(label).not.toBeNull();
    expect(label!.textContent?.trim()).toBe('> INGEST');
  });

  it('applies the header-kind class for "header"', () => {
    const { container } = render(SysLabelHost, {
      props: { kind: 'header', text: 'AWAITING_SOURCE' }
    });
    const label = container.querySelector('.sys-label');
    expect(label!.classList.contains('sys-label--header')).toBe(true);
    expect(label!.classList.contains('sys-label--action')).toBe(false);
  });

  it('applies the action-kind class for "action"', () => {
    const { container } = render(SysLabelHost, {
      props: { kind: 'action', text: 'RECALL' }
    });
    const label = container.querySelector('.sys-label');
    expect(label!.classList.contains('sys-label--action')).toBe(true);
    expect(label!.classList.contains('sys-label--header')).toBe(false);
  });

  it('renders the prefix as a separate element so styling can target it', () => {
    const { container } = render(SysLabelHost, {
      props: { kind: 'header', text: 'INGESTING_SOURCE' }
    });
    const prefix = container.querySelector('.sys-label__prefix');
    expect(prefix).not.toBeNull();
    expect(prefix!.textContent).toBe('//');
  });
});
