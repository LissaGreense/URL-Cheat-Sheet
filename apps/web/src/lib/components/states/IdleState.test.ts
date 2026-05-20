/**
 * @fileoverview Contract tests for IdleState — the cinematic idle screen
 * from spec §4.1 / plan Task 3.
 *
 * The component composes the HUD primitives (HudPanel, StatusPill,
 * SysLabel, CornerStamp) and owns its own typography (display-face
 * wordmark + directive). Tests cover the structural contract:
 *   - the directive `LOAD URL TO YOUR MEMORY` renders verbatim
 *   - the status pill flips `[ STANDBY ]` → `[ READY ]` based on input
 *     validity (non-empty trimmed string)
 *   - `onSubmit` fires when the form is submitted, receiving the
 *     SubmitEvent
 *   - the persistent sys-voice anchors are present
 *     (`// AWAITING_SOURCE`, `001 SESSION`)
 *
 * Phase 1 contract is structural. Visual chrome (colors, type sizing,
 * positioning) is in scoped CSS — jsdom strips Svelte-scoped styles, so
 * we assert markup, not computed styles.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import IdleStateHost from './IdleState.test-host.svelte';

afterEach(() => {
  cleanup();
});

describe('IdleState', () => {
  it('renders the LOAD URL TO YOUR MEMORY directive', () => {
    const { container } = render(IdleStateHost, {
      props: { urlInput: '', onSubmit: () => {} }
    });
    expect(container.textContent).toContain('LOAD URL TO YOUR MEMORY');
  });

  it('renders the URL_CHEAT_SHEET wordmark', () => {
    const { container } = render(IdleStateHost, {
      props: { urlInput: '', onSubmit: () => {} }
    });
    expect(container.textContent).toContain('URL_CHEAT_SHEET');
  });

  it('renders the // AWAITING_SOURCE sys-voice header', () => {
    const { container } = render(IdleStateHost, {
      props: { urlInput: '', onSubmit: () => {} }
    });
    expect(container.textContent).toContain('AWAITING_SOURCE');
    // SysLabel kind="header" emits the `//` prefix.
    expect(container.textContent).toContain('//');
  });

  it('renders the 001 SESSION corner stamp', () => {
    const { container } = render(IdleStateHost, {
      props: { urlInput: '', onSubmit: () => {} }
    });
    const stamp = container.querySelector('.corner-stamp');
    expect(stamp).not.toBeNull();
    expect(stamp!.textContent).toContain('001 SESSION');
  });

  it('renders the > INGEST submit action', () => {
    const { container } = render(IdleStateHost, {
      props: { urlInput: '', onSubmit: () => {} }
    });
    expect(container.textContent).toContain('INGEST');
    const submit = container.querySelector('button[type="submit"]');
    expect(submit).not.toBeNull();
  });

  it('shows [ STANDBY ] when the URL input is empty', () => {
    const { container } = render(IdleStateHost, {
      props: { urlInput: '', onSubmit: () => {} }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent?.trim()).toBe('[ STANDBY ]');
  });

  it('shows [ STANDBY ] when the URL input is whitespace only', () => {
    const { container } = render(IdleStateHost, {
      props: { urlInput: '   ', onSubmit: () => {} }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.textContent?.trim()).toBe('[ STANDBY ]');
  });

  it('flips to [ READY ] when the URL input has non-empty trimmed content', () => {
    const { container } = render(IdleStateHost, {
      props: { urlInput: 'https://example.com', onSubmit: () => {} }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.textContent?.trim()).toBe('[ READY ]');
  });

  it('fires onSubmit when the form is submitted', async () => {
    const onSubmit = vi.fn();
    const { container } = render(IdleStateHost, {
      props: { urlInput: 'https://example.com', onSubmit }
    });
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await fireEvent.submit(form!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // The callback receives the SubmitEvent.
    expect(onSubmit.mock.calls[0]![0]).toBeInstanceOf(Event);
  });

  it('renders a URL input bound to urlInput', () => {
    const { container } = render(IdleStateHost, {
      props: { urlInput: 'https://example.com', onSubmit: () => {} }
    });
    const input = container.querySelector('input[type="url"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('https://example.com');
  });

  it('places the URL input inside a HudPanel', () => {
    const { container } = render(IdleStateHost, {
      props: { urlInput: '', onSubmit: () => {} }
    });
    const input = container.querySelector('input[type="url"]');
    expect(input).not.toBeNull();
    expect(input!.closest('.hud-panel')).not.toBeNull();
  });
});
