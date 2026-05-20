/**
 * @fileoverview Contract tests for ExtractErrorState — the cinematic
 * "ingest failed" screen from spec §4.3 / plan Task 4.
 *
 * Phase 1 contract (no motion — Phase 2 owns phosphorFlash + scrambleIn):
 *   - `// INGEST_FAILED` sys-voice header anchors the screen.
 *   - Humanized error message renders in body sans.
 *   - Error code (`FETCH_TIMEOUT`, etc.) renders in sys-voice micro-caps.
 *   - `[ HALTED ]` status pill in alarm tone.
 *   - `[ NEW_SOURCE ]` reset CTA wired to `onReset`.
 *   - `001 SESSION` persistent corner stamp.
 *
 * jsdom strips Svelte-scoped CSS so tests assert markup, not computed
 * colors. The "amber-alarm only appears in extract-error" spec contract
 * is enforced separately by a source-grep test against `.svelte` files.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import ExtractErrorState from './ExtractErrorState.svelte';

afterEach(() => {
  cleanup();
});

describe('ExtractErrorState', () => {
  const baseProps = {
    message: 'The page took too long to load.',
    errorCode: 'FETCH_TIMEOUT',
    onReset: () => {}
  };

  it('renders the // INGEST_FAILED sys-voice header', () => {
    const { container } = render(ExtractErrorState, { props: baseProps });
    expect(container.textContent).toContain('INGEST_FAILED');
    expect(container.textContent).toContain('//');
  });

  it('renders the humanized error message', () => {
    const { container } = render(ExtractErrorState, {
      props: { ...baseProps, message: 'The page took too long to load.' }
    });
    expect(container.textContent).toContain('The page took too long to load.');
  });

  it('renders the error code (FETCH_TIMEOUT) in sys-voice micro-caps', () => {
    const { container } = render(ExtractErrorState, {
      props: { ...baseProps, errorCode: 'FETCH_TIMEOUT' }
    });
    const code = container.querySelector('[data-testid="extract-error-code"]');
    expect(code, 'error code element missing').not.toBeNull();
    expect(code!.textContent).toContain('FETCH_TIMEOUT');
  });

  it('renders a different error code verbatim', () => {
    const { container } = render(ExtractErrorState, {
      props: { ...baseProps, errorCode: 'FETCH_HTTP_ERROR' }
    });
    const code = container.querySelector('[data-testid="extract-error-code"]');
    expect(code!.textContent).toContain('FETCH_HTTP_ERROR');
  });

  it('renders [ HALTED ] as the status pill with alarm tone', () => {
    const { container } = render(ExtractErrorState, { props: baseProps });
    const pill = container.querySelector('.status-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent?.trim()).toBe('[ HALTED ]');
    expect(pill!.classList.contains('status-pill--alarm')).toBe(true);
  });

  it('renders the > NEW_SOURCE reset CTA', () => {
    const { container } = render(ExtractErrorState, { props: baseProps });
    expect(container.textContent).toContain('NEW_SOURCE');
    const btn = container.querySelector('button[type="button"]');
    expect(btn, 'reset button missing').not.toBeNull();
  });

  it('fires onReset when the NEW_SOURCE button is clicked', async () => {
    const onReset = vi.fn();
    const { container } = render(ExtractErrorState, {
      props: { ...baseProps, onReset }
    });
    const btn = container.querySelector('button[type="button"]') as HTMLButtonElement;
    await fireEvent.click(btn);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('renders the 001 SESSION corner stamp', () => {
    const { container } = render(ExtractErrorState, { props: baseProps });
    const stamp = container.querySelector('.corner-stamp');
    expect(stamp).not.toBeNull();
    expect(stamp!.textContent).toContain('001 SESSION');
  });

  it('places the INGEST_FAILED header inside an alarm-variant HudPanel', () => {
    const { container } = render(ExtractErrorState, { props: baseProps });
    const alarmPanel = container.querySelector('.hud-panel--alarm');
    expect(alarmPanel, 'alarm HudPanel missing').not.toBeNull();
  });
});
