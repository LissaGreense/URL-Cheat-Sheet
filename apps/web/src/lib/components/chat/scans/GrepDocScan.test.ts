/**
 * @fileoverview Contract tests for GrepDocScan — the static Phase 1
 * interior for `grep_doc` tool calls (spec §5.1, plan Task 5).
 *
 * Behaviour under test:
 *   - state prop maps to the correct status string in the pill
 *   - `done` with a hit count renders `<n> HITS`
 *   - query string renders under `q: "..."` prefix
 *   - faulted state forwards the error glyph + alarm tone to ScanCard
 *
 * No motion in Phase 1 — the scanline sweep arrives in Phase 2.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import GrepDocScan from './GrepDocScan.svelte';

afterEach(() => {
  cleanup();
});

describe('GrepDocScan', () => {
  it('maps state="pending" → [ SCANNING ]', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'pending' }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ SCANNING ]');
  });

  it('maps state="scanning" → [ SCANNING ]', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'scanning' }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ SCANNING ]');
  });

  it('maps state="done" with hits=3 → [ 3 HITS ]', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'done', hits: 3 }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ 3 HITS ]');
  });

  it('maps state="done" with hits=0 → [ 0 HITS ] (count rendered verbatim)', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'done', hits: 0 }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ 0 HITS ]');
  });

  it('maps state="no-hits" → [ NO_HITS ]', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'no-hits' }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ NO_HITS ]');
  });

  it('maps state="faulted" → [ FAULTED ] in alarm tone with error glyph', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'faulted' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.textContent?.trim()).toBe('[ FAULTED ]');
    expect(pill!.classList.contains('status-pill--alarm')).toBe(true);
    expect(container.querySelector('.scan-card__error-glyph')).not.toBeNull();
  });

  it('maps state="halted" → [ HALTED ] in dim tone', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'halted' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.textContent?.trim()).toBe('[ HALTED ]');
    expect(pill!.classList.contains('status-pill--dim')).toBe(true);
  });

  it('renders the query string under q: "..."', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'green tea', state: 'scanning' }
    });
    expect(container.textContent).toContain('q:');
    expect(container.textContent).toContain('"green tea"');
  });

  it('renders an OR-union query verbatim when MessageStream joins array patterns', () => {
    // The tool schema (packages/agent/src/tools/grep-doc.ts) accepts
    // `pattern: string | string[]`. The array form is rendered by
    // MessageStream as `a | b | c` (ucs-aoo fix). This test pins the
    // contract that GrepDocScan renders that joined string verbatim,
    // not just a single token.
    const { container } = render(GrepDocScan, {
      props: { query: 'error | exception | fault', state: 'scanning' }
    });
    expect(container.textContent).toContain('"error | exception | fault"');
  });

  it('renders the hit count verbatim — array length is provided by the mapper, not the scan', () => {
    // Regression pin for ucs-ozi. MessageStream.hitsFor maps
    // `output.matches.length` to the `hits` prop; GrepDocScan just
    // renders the number. We verify that path here: any positive count
    // surfaces in the `<n> HITS` pill verbatim.
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'done', hits: 7 }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ 7 HITS ]');
  });

  it('renders the GREP_DOC tool name in the header', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'scanning' }
    });
    expect(container.textContent).toContain('GREP_DOC');
  });

  it('renders a glyph-grid backdrop element', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'scanning' }
    });
    expect(container.querySelector('.grep-doc__backdrop')).not.toBeNull();
  });

  it('renders a .scan-sweep__line child so the scanSweep action can target it', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'scanning' }
    });
    expect(container.querySelector('.scan-sweep__line')).not.toBeNull();
  });

  it('dims the backdrop (--dim modifier class) when state="done"', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'done', hits: 1 }
    });
    const backdrop = container.querySelector('.grep-doc__backdrop');
    expect(backdrop?.classList.contains('grep-doc__backdrop--dim')).toBe(true);
  });

  it('dims the backdrop (--dim modifier class) when state="no-hits"', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'no-hits' }
    });
    const backdrop = container.querySelector('.grep-doc__backdrop');
    expect(backdrop?.classList.contains('grep-doc__backdrop--dim')).toBe(true);
  });

  it('does NOT dim the backdrop while state="scanning"', () => {
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'scanning' }
    });
    const backdrop = container.querySelector('.grep-doc__backdrop');
    expect(backdrop?.classList.contains('grep-doc__backdrop--dim')).toBe(false);
  });

  it('tags the scanline with data-state for failure / cancellation visuals', () => {
    // Spec §5.3 — faulted dims the bar to 30%; the CSS hangs off the
    // attribute selector, so we just assert the attribute is wired.
    const { container } = render(GrepDocScan, {
      props: { query: 'tea', state: 'faulted' }
    });
    const line = container.querySelector('.scan-sweep__line');
    expect(line?.getAttribute('data-state')).toBe('faulted');
  });
});
