/**
 * @fileoverview Contract tests for FlaggedState — the cinematic
 * "source caveat" screen from spec §4.4 / plan Task 4.
 *
 * The plan calls this out as a critical taste decision: FlaggedState
 * uses memex voice (NOT alarm voice). The `// SOURCE_CAVEAT` header
 * stays bone-colored, the StatusPill is `normal` tone, the HudPanel is
 * default variant — no amber, no alarm. Threat severity bars use
 * `--green-acid` (the curator's palette), not amber.
 *
 * Phase 1 contract:
 *   - `// SOURCE_CAVEAT` sys-voice header (NOT alarm).
 *   - 3 sys-voice metadata rows: `> title:`, `> url:`, `> detected:`.
 *   - Threat list with severity bars (1px-tall, green-acid, width
 *     proportional to severity 0..1).
 *   - `[ REVIEW_REQUIRED ]` status pill.
 *   - Two CTAs: `[ CONTINUE_ANYWAY ]` (fires `onContinue`) and
 *     `[ NEW_SOURCE ]` (fires `onReset`).
 *   - `001 SESSION` corner stamp.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import type { ExtractResponse } from '@url-cheat-sheet/schemas';
import FlaggedStateHost from './FlaggedState.test-host.svelte';

afterEach(() => {
  cleanup();
});

/**
 * Build a synthetic ExtractResponse with the given threats and a
 * deterministic title/url. Tests pass `safe: false` since the parent
 * only routes to FlaggedState when `scan.safe === false`.
 */
function buildPreview(
  threats: ReadonlyArray<{
    type: ExtractResponse['scan']['threats'][number]['type'];
    severity: number;
  }>,
  overrides: Partial<Pick<ExtractResponse, 'title' | 'sourceUrl'>> = {}
): ExtractResponse {
  return {
    text: 'page body',
    title: overrides.title ?? 'Suspicious Page',
    sourceUrl: overrides.sourceUrl ?? 'https://example.com/sus',
    headings: [],
    byteSize: 1234,
    scan: { safe: false, threats }
  };
}

describe('FlaggedState', () => {
  const noop = () => {};

  it('renders the // SOURCE_CAVEAT sys-voice header (NOT alarm)', () => {
    const { container } = render(FlaggedStateHost, {
      props: {
        preview: buildPreview([{ type: 'instruction-override', severity: 0.5 }]),
        onContinue: noop,
        onReset: noop
      }
    });
    expect(container.textContent).toContain('SOURCE_CAVEAT');
    expect(container.textContent).toContain('//');

    // Memex voice: the panel must NOT be alarm-variant and the header
    // must NOT inherit amber.
    const alarmPanel = container.querySelector('.hud-panel--alarm');
    expect(alarmPanel, 'FlaggedState must not use alarm HudPanel').toBeNull();
  });

  it('renders the 3 metadata rows (title, url, detected count)', () => {
    const { container } = render(FlaggedStateHost, {
      props: {
        preview: buildPreview(
          [
            { type: 'instruction-override', severity: 0.8 },
            { type: 'leak', severity: 0.4 }
          ],
          { title: 'My Title', sourceUrl: 'https://example.com/page' }
        ),
        onContinue: noop,
        onReset: noop
      }
    });

    const text = container.textContent ?? '';
    expect(text).toContain('title:');
    expect(text).toContain('My Title');
    expect(text).toContain('url:');
    expect(text).toContain('https://example.com/page');
    expect(text).toContain('detected:');
    // 2 threats — the count appears as "2 pattern(s)" or similar.
    expect(text).toMatch(/2\s*pattern/);
  });

  it('renders one threat row per threat with the threat type', () => {
    const { container } = render(FlaggedStateHost, {
      props: {
        preview: buildPreview([
          { type: 'instruction-override', severity: 0.9 },
          { type: 'leak', severity: 0.3 },
          { type: 'delimiter', severity: 0.6 }
        ]),
        onContinue: noop,
        onReset: noop
      }
    });

    const rows = container.querySelectorAll('[data-testid="threat-row"]');
    expect(rows.length).toBe(3);
    expect(rows[0]!.textContent).toContain('instruction-override');
    expect(rows[1]!.textContent).toContain('leak');
    expect(rows[2]!.textContent).toContain('delimiter');
  });

  it('renders severity bars with width proportional to severity (0..1)', () => {
    const { container } = render(FlaggedStateHost, {
      props: {
        preview: buildPreview([
          { type: 'instruction-override', severity: 1 },
          { type: 'leak', severity: 0.5 },
          { type: 'delimiter', severity: 0 }
        ]),
        onContinue: noop,
        onReset: noop
      }
    });

    const bars = container.querySelectorAll('[data-testid="threat-bar"]');
    expect(bars.length).toBe(3);
    // Inline `style="width: ${severity * 100}%"` — assert percentages.
    expect((bars[0] as HTMLElement).style.width).toBe('100%');
    expect((bars[1] as HTMLElement).style.width).toBe('50%');
    expect((bars[2] as HTMLElement).style.width).toBe('0%');
  });

  it('renders [ REVIEW_REQUIRED ] status pill in normal (non-alarm) tone', () => {
    const { container } = render(FlaggedStateHost, {
      props: {
        preview: buildPreview([{ type: 'instruction-override', severity: 0.5 }]),
        onContinue: noop,
        onReset: noop
      }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent?.trim()).toBe('[ REVIEW_REQUIRED ]');
    // Memex voice: pill stays in normal tone, NOT alarm.
    expect(pill!.classList.contains('status-pill--alarm')).toBe(false);
  });

  it('fires onContinue when the CONTINUE_ANYWAY button is clicked', async () => {
    const onContinue = vi.fn();
    const onReset = vi.fn();
    const { container } = render(FlaggedStateHost, {
      props: {
        preview: buildPreview([{ type: 'instruction-override', severity: 0.5 }]),
        onContinue,
        onReset
      }
    });
    const btn = container.querySelector('[data-testid="continue-btn"]') as HTMLButtonElement;
    expect(btn, 'continue button missing').not.toBeNull();
    await fireEvent.click(btn);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onReset).not.toHaveBeenCalled();
  });

  it('fires onReset when the NEW_SOURCE button is clicked', async () => {
    const onContinue = vi.fn();
    const onReset = vi.fn();
    const { container } = render(FlaggedStateHost, {
      props: {
        preview: buildPreview([{ type: 'instruction-override', severity: 0.5 }]),
        onContinue,
        onReset
      }
    });
    const btn = container.querySelector('[data-testid="reset-btn"]') as HTMLButtonElement;
    expect(btn, 'reset button missing').not.toBeNull();
    await fireEvent.click(btn);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('renders the 001 SESSION corner stamp', () => {
    const { container } = render(FlaggedStateHost, {
      props: {
        preview: buildPreview([{ type: 'instruction-override', severity: 0.5 }]),
        onContinue: noop,
        onReset: noop
      }
    });
    const stamp = container.querySelector('.corner-stamp');
    expect(stamp).not.toBeNull();
    expect(stamp!.textContent).toContain('001 SESSION');
  });

  it('renders the CONTINUE_ANYWAY and NEW_SOURCE action labels', () => {
    const { container } = render(FlaggedStateHost, {
      props: {
        preview: buildPreview([{ type: 'instruction-override', severity: 0.5 }]),
        onContinue: noop,
        onReset: noop
      }
    });
    expect(container.textContent).toContain('CONTINUE_ANYWAY');
    expect(container.textContent).toContain('NEW_SOURCE');
  });
});
