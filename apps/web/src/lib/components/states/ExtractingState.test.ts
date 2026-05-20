/**
 * @fileoverview Contract tests for ExtractingState — the cinematic
 * "ingest in progress" screen from spec §4.2 / plan Task 3.
 *
 * Phase 1 contract (no cinematic exit transition yet — that's Phase 2 /
 * Task 13):
 *   - `// INGESTING_SOURCE` sys-voice header anchors the screen
 *   - the URL is rendered as-is for short URLs, and truncated to
 *     `slice(0, 53) + '...'` when longer than 56 characters
 *   - a vertical bar element is present (the indeterminate growth bar;
 *     animated via scoped `@keyframes` — only Task 3's motion carve-out)
 *   - `[ READING ]` status pill renders verbatim
 *   - `001 SESSION` corner stamp renders
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ExtractingState from './ExtractingState.svelte';

afterEach(() => {
  cleanup();
});

describe('ExtractingState', () => {
  it('renders the // INGESTING_SOURCE sys-voice header', () => {
    const { container } = render(ExtractingState, {
      props: { url: 'https://example.com' }
    });
    expect(container.textContent).toContain('INGESTING_SOURCE');
    expect(container.textContent).toContain('//');
  });

  it('renders the URL verbatim when it is 56 characters or fewer', () => {
    const url = 'https://example.com/short-path';
    expect(url.length).toBeLessThanOrEqual(56);
    const { container } = render(ExtractingState, { props: { url } });
    const display = container.querySelector('[data-testid="extracting-url"]');
    expect(display).not.toBeNull();
    expect(display!.textContent).toBe(url);
  });

  it('renders the URL verbatim when it is exactly 56 characters', () => {
    const url = 'https://example.com/' + 'a'.repeat(56 - 'https://example.com/'.length);
    expect(url.length).toBe(56);
    const { container } = render(ExtractingState, { props: { url } });
    const display = container.querySelector('[data-testid="extracting-url"]');
    expect(display!.textContent).toBe(url);
  });

  it('truncates URLs longer than 56 chars to slice(0, 53) + "..."', () => {
    const url = 'https://example.com/' + 'a'.repeat(200);
    expect(url.length).toBeGreaterThan(56);
    const { container } = render(ExtractingState, { props: { url } });
    const display = container.querySelector('[data-testid="extracting-url"]');
    const expected = url.slice(0, 53) + '...';
    expect(display!.textContent).toBe(expected);
    // The displayed string is exactly 56 characters wide.
    expect(display!.textContent!.length).toBe(56);
  });

  it('renders the vertical growth bar element', () => {
    const { container } = render(ExtractingState, {
      props: { url: 'https://example.com' }
    });
    const bar = container.querySelector('.extracting-bar');
    expect(bar).not.toBeNull();
  });

  it('places the growth bar inside a HudPanel', () => {
    const { container } = render(ExtractingState, {
      props: { url: 'https://example.com' }
    });
    const bar = container.querySelector('.extracting-bar');
    expect(bar!.closest('.hud-panel')).not.toBeNull();
  });

  it('renders [ READING ] as the status pill', () => {
    const { container } = render(ExtractingState, {
      props: { url: 'https://example.com' }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent?.trim()).toBe('[ READING ]');
  });

  it('renders the 001 SESSION corner stamp', () => {
    const { container } = render(ExtractingState, {
      props: { url: 'https://example.com' }
    });
    const stamp = container.querySelector('.corner-stamp');
    expect(stamp).not.toBeNull();
    expect(stamp!.textContent).toContain('001 SESSION');
  });
});
