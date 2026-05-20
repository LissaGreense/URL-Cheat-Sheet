/**
 * @fileoverview Contract tests for OutlineScan — the Phase 2 static
 * interior for `outline` tool calls (spec §5.5 future-tools rule,
 * ucs-8n1 close-out).
 *
 * Behaviour under test:
 *   - state prop maps to the correct status pill string
 *   - non-empty heading list renders one row per heading with
 *     `L<line>` + `#`-prefix + text
 *   - empty heading list (post-output) renders NO_SECTIONS pill +
 *     dim tone
 *   - faulted state surfaces FAULTED + alarm tone + error glyph
 *
 * No motion — `outline` is a read-only structural tool, chrome is
 * intentionally static (ADR 0009).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import OutlineScan from './OutlineScan.svelte';

afterEach(() => {
  cleanup();
});

describe('OutlineScan', () => {
  it('renders the OUTLINE tool name in the header', () => {
    const { container } = render(OutlineScan, {
      props: { headings: [], state: 'input-streaming' }
    });
    expect(container.textContent).toContain('OUTLINE');
  });

  it('maps state="input-streaming" → [ SCANNING ]', () => {
    const { container } = render(OutlineScan, {
      props: { headings: [], state: 'input-streaming' }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ SCANNING ]');
  });

  it('maps state="input-available" → [ SCANNING ]', () => {
    // Input arrived, output pending — outline calls are fast but the
    // round-trip is non-zero, so we keep the pill in SCANNING until
    // the headings actually arrive.
    const { container } = render(OutlineScan, {
      props: { headings: [], state: 'input-available' }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ SCANNING ]');
  });

  it('maps state="output-available" with 3 headings → [ 3 SECTIONS ]', () => {
    const headings = [
      { text: 'Intro', level: 1, line: 1 },
      { text: 'Body', level: 2, line: 10 },
      { text: 'Conclusion', level: 2, line: 42 }
    ];
    const { container } = render(OutlineScan, {
      props: { headings, state: 'output-available' }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ 3 SECTIONS ]');
  });

  it('maps state="output-available" with 0 headings → [ NO_SECTIONS ] in dim tone', () => {
    const { container } = render(OutlineScan, {
      props: { headings: [], state: 'output-available' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.textContent?.trim()).toBe('[ NO_SECTIONS ]');
    expect(pill!.classList.contains('status-pill--dim')).toBe(true);
  });

  it('maps state="output-error" → [ FAULTED ] in alarm tone with error glyph', () => {
    const { container } = render(OutlineScan, {
      props: { headings: [], state: 'output-error' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.textContent?.trim()).toBe('[ FAULTED ]');
    expect(pill!.classList.contains('status-pill--alarm')).toBe(true);
    expect(container.querySelector('.scan-card__error-glyph')).not.toBeNull();
  });

  it('renders one .outline__item per heading with L<line>, # prefix, and text', () => {
    const headings = [
      { text: 'API Reference', level: 2, line: 42 },
      { text: 'Errors', level: 3, line: 78 }
    ];
    const { container } = render(OutlineScan, {
      props: { headings, state: 'output-available' }
    });
    const items = container.querySelectorAll('.outline__item');
    expect(items.length).toBe(2);
    // Row 0: L42 ## API Reference
    expect(items[0]!.querySelector('.outline__line')!.textContent).toBe('L42');
    expect(items[0]!.querySelector('.outline__prefix')!.textContent).toBe('##');
    expect(items[0]!.querySelector('.outline__text')!.textContent).toBe('API Reference');
    // Row 1: L78 ### Errors
    expect(items[1]!.querySelector('.outline__line')!.textContent).toBe('L78');
    expect(items[1]!.querySelector('.outline__prefix')!.textContent).toBe('###');
    expect(items[1]!.querySelector('.outline__text')!.textContent).toBe('Errors');
  });

  it('tags each item with data-level so future styling can hang off depth', () => {
    const headings = [
      { text: 'A', level: 1, line: 1 },
      { text: 'B', level: 3, line: 5 }
    ];
    const { container } = render(OutlineScan, {
      props: { headings, state: 'output-available' }
    });
    const items = container.querySelectorAll('.outline__item');
    expect(items[0]!.getAttribute('data-level')).toBe('1');
    expect(items[1]!.getAttribute('data-level')).toBe('3');
  });

  it('does not render the heading list before output-available', () => {
    // Pre-output states show only the chrome — the list itself is
    // gated on `output-available` so we don't paint a misleading empty
    // <ol> while the tool is still pending.
    const headings = [{ text: 'A', level: 1, line: 1 }];
    const { container } = render(OutlineScan, {
      props: { headings, state: 'input-streaming' }
    });
    expect(container.querySelector('.outline__list')).toBeNull();
  });

  it('renders a "no sections" sys-voice line in the empty success branch', () => {
    const { container } = render(OutlineScan, {
      props: { headings: [], state: 'output-available' }
    });
    const empty = container.querySelector('.outline__empty');
    expect(empty).not.toBeNull();
    // Sys-voice register (uppercased via CSS, source text is lowercase).
    expect(empty!.textContent?.toLowerCase()).toContain('no sections');
  });

  it('caps the # prefix at 6 for over-depth headings (defensive)', () => {
    // The schema constrains level to 1-6; this guard exists for
    // resilience against drift, not a real shape.
    const headings = [{ text: 'Deep', level: 9, line: 1 }];
    const { container } = render(OutlineScan, {
      props: { headings, state: 'output-available' }
    });
    const prefix = container.querySelector('.outline__prefix');
    expect(prefix!.textContent).toBe('######');
  });
});
