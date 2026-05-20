/**
 * @fileoverview Contract tests for ReadLinesScan — the Phase 2 static
 * interior for `read_lines` tool calls (spec §5.5 future-tools rule,
 * ucs-8n1 close-out).
 *
 * Behaviour under test:
 *   - state prop maps to the correct status pill string
 *   - input-available with a range pins the pill to `L<start>–L<end>`
 *   - output-available renders the returned text in a <pre> block,
 *     preserving the tool's `Lxx | ` prefixes
 *   - empty-text output renders EMPTY_RANGE pill + dim tone
 *   - truncated output surfaces the truncation note
 *   - faulted state surfaces FAULTED + alarm tone + error glyph
 *
 * No motion — `read_lines` is a read-only structural tool, chrome is
 * intentionally static (ADR 0009).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ReadLinesScan from './ReadLinesScan.svelte';

afterEach(() => {
  cleanup();
});

describe('ReadLinesScan', () => {
  it('renders the READ_LINES tool name in the header', () => {
    const { container } = render(ReadLinesScan, {
      props: { start: null, end: null, text: null, truncated: false, state: 'input-streaming' }
    });
    expect(container.textContent).toContain('READ_LINES');
  });

  it('maps state="input-streaming" with no range → [ READING ]', () => {
    const { container } = render(ReadLinesScan, {
      props: { start: null, end: null, text: null, truncated: false, state: 'input-streaming' }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ READING ]');
  });

  it('maps state="input-available" with a range → [ L10–L20 ]', () => {
    const { container } = render(ReadLinesScan, {
      props: { start: 10, end: 20, text: null, truncated: false, state: 'input-available' }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ L10–L20 ]');
  });

  it('maps state="output-available" with text → [ L10–L12 ] and renders the text in a <pre>', () => {
    const { container } = render(ReadLinesScan, {
      props: {
        start: 10,
        end: 12,
        text: 'L10 | first\nL11 | second\nL12 | third',
        truncated: false,
        state: 'output-available'
      }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ L10–L12 ]');
    const pre = container.querySelector('pre.read-lines__text');
    expect(pre).not.toBeNull();
    // Verbatim: the tool already prefixes `Lxx | `, so the <pre> should
    // contain those literal prefixes.
    expect(pre!.textContent).toContain('L10 | first');
    expect(pre!.textContent).toContain('L12 | third');
  });

  it('maps state="output-available" with empty text → [ EMPTY_RANGE ] in dim tone', () => {
    const { container } = render(ReadLinesScan, {
      props: { start: 1, end: 1, text: '', truncated: false, state: 'output-available' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.textContent?.trim()).toBe('[ EMPTY_RANGE ]');
    expect(pill!.classList.contains('status-pill--dim')).toBe(true);
    // Empty-range branch renders a sys-voice line, not a <pre>.
    expect(container.querySelector('pre.read-lines__text')).toBeNull();
    expect(container.querySelector('.read-lines__empty')).not.toBeNull();
  });

  it('maps state="output-error" → [ FAULTED ] in alarm tone with error glyph', () => {
    const { container } = render(ReadLinesScan, {
      props: { start: 1, end: 5, text: null, truncated: false, state: 'output-error' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.textContent?.trim()).toBe('[ FAULTED ]');
    expect(pill!.classList.contains('status-pill--alarm')).toBe(true);
    expect(container.querySelector('.scan-card__error-glyph')).not.toBeNull();
  });

  it('surfaces the truncation note when truncated=true', () => {
    const { container } = render(ReadLinesScan, {
      props: {
        start: 1,
        end: 500,
        text: 'L1 | x',
        truncated: true,
        state: 'output-available'
      }
    });
    const note = container.querySelector('.read-lines__truncated');
    expect(note).not.toBeNull();
    expect(note!.textContent?.toLowerCase()).toContain('truncated');
  });

  it('omits the truncation note when truncated=false', () => {
    const { container } = render(ReadLinesScan, {
      props: {
        start: 1,
        end: 2,
        text: 'L1 | x\nL2 | y',
        truncated: false,
        state: 'output-available'
      }
    });
    expect(container.querySelector('.read-lines__truncated')).toBeNull();
  });

  it('does not render the <pre> before output-available', () => {
    // Pre-output: pill carries the range; the snippet block waits for
    // actual text so we don't paint an empty <pre>.
    const { container } = render(ReadLinesScan, {
      props: { start: 1, end: 5, text: null, truncated: false, state: 'input-available' }
    });
    expect(container.querySelector('pre.read-lines__text')).toBeNull();
  });

  it('preserves the `Lxx | ` prefix verbatim in the <pre>', () => {
    // The tool's contract is that it already prefixes each line with
    // `Lxx | ` (see packages/agent/src/tools/read-lines.ts). The scan
    // must NOT strip or rewrite those — the model cites them back to
    // the user verbatim.
    const text = 'L100 | first line\nL101 | second line';
    const { container } = render(ReadLinesScan, {
      props: { start: 100, end: 101, text, truncated: false, state: 'output-available' }
    });
    const pre = container.querySelector('pre.read-lines__text');
    expect(pre!.textContent).toBe(text);
  });
});
