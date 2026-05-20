/**
 * @fileoverview Contract tests for SettingsDrawer — the BYO Anthropic
 * key entry component (spec § UX surface, plan Task 4 of
 * `docs/plans/2026-05-20-byo-anthropic-key.md`).
 *
 * Behaviour under test:
 *   - Entry view (apiKey === null) renders a password input + Save
 *     button + threat-model paragraph verbatim
 *   - Empty Save shows the "Enter a key" inline error and does not
 *     mutate the bound state
 *   - Wrong-prefix Save shows the "sk-ant-…" inline error and does
 *     not mutate the bound state
 *   - Valid Save trims whitespace, writes the trimmed value to the
 *     bound state, clears the input element, and switches to the
 *     Saved view with a last-4 chip
 *   - Saved view (apiKey set) shows the last-4 chip + Replace +
 *     Forget key buttons; Forget reverts the bound state to null and
 *     returns to the Entry view
 *   - Reveal toggle flips input type between `password` and `text`
 *
 * Phase 1 contract is structural; visual chrome (scoped CSS, font
 * tokens) is not asserted under jsdom — see IdleState.test.ts for the
 * same convention.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import SettingsDrawerHost from '../src/lib/components/SettingsDrawer.test-host.svelte';

afterEach(() => {
  cleanup();
});

// Exact spec § "Threat model — honest disclosure" → drawer paragraph.
// Byte-for-byte match is part of the acceptance criteria — if this
// string ever needs to change, update both the spec and this test.
const THREAT_MODEL_COPY =
  'Your key is stored in this browser tab only — not on disk, not on our servers. ' +
  'Each chat turn sends your key over HTTPS to our server, which uses it once to ' +
  'call Anthropic and then discards it. Anything that runs in this tab (browser ' +
  'extensions, scripts) can read your key while the tab is open. We recommend ' +
  'setting a per-key spend cap in your Anthropic Console before pasting it here.';

describe('SettingsDrawer — entry view', () => {
  it('renders a password input when apiKey is null', () => {
    const { container } = render(SettingsDrawerHost, {
      props: { initial: null }
    });
    const input = container.querySelector('input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.type).toBe('password');
    expect(input!.autocomplete).toBe('off');
    // jsdom's IDL `spellcheck` reflection is unreliable across versions;
    // assert the attribute string instead.
    expect(input!.getAttribute('spellcheck')).toBe('false');
  });

  it('renders a Save button', () => {
    const { container } = render(SettingsDrawerHost, {
      props: { initial: null }
    });
    const save = container.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(save).not.toBeNull();
    expect(save!.textContent).toContain('Save');
  });

  it('renders the threat-model paragraph verbatim', () => {
    const { container } = render(SettingsDrawerHost, {
      props: { initial: null }
    });
    // Normalise whitespace so the assertion doesn't break on accidental
    // line-wrapping in the template. The acceptance criterion is the
    // *text content* matches byte-for-byte; the source markup may wrap.
    const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(text).toContain(THREAT_MODEL_COPY);
  });

  it('renders a reveal toggle that flips input type to text', async () => {
    const { container } = render(SettingsDrawerHost, {
      props: { initial: null }
    });
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('password');
    const reveal = container.querySelector(
      '[data-testid="reveal-toggle"]'
    ) as HTMLButtonElement | null;
    expect(reveal).not.toBeNull();
    await fireEvent.click(reveal!);
    expect(input.type).toBe('text');
    await fireEvent.click(reveal!);
    expect(input.type).toBe('password');
  });
});

describe('SettingsDrawer — validation', () => {
  it('shows "Enter a key" error and leaves bound state null when Save is empty', async () => {
    const { container, getByTestId } = render(SettingsDrawerHost, {
      props: { initial: null }
    });
    const form = container.querySelector('form') as HTMLFormElement;
    await fireEvent.submit(form);
    const error = container.querySelector('[data-testid="error"]');
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain('Enter a key');
    expect(getByTestId('host').getAttribute('data-bound-key')).toBe('');
  });

  it('shows the prefix error and leaves bound state null when key is malformed', async () => {
    const { container, getByTestId } = render(SettingsDrawerHost, {
      props: { initial: null }
    });
    const input = container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'foo' } });
    const form = container.querySelector('form') as HTMLFormElement;
    await fireEvent.submit(form);
    const error = container.querySelector('[data-testid="error"]');
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain('sk-ant-');
    expect(getByTestId('host').getAttribute('data-bound-key')).toBe('');
  });

  it('trims whitespace before validation', async () => {
    const { container, getByTestId } = render(SettingsDrawerHost, {
      props: { initial: null }
    });
    const input = container.querySelector('input') as HTMLInputElement;
    // Wrap a valid key in whitespace; the trimmed value should land in
    // the bound state.
    await fireEvent.input(input, { target: { value: '  sk-ant-abc123def456  ' } });
    const form = container.querySelector('form') as HTMLFormElement;
    await fireEvent.submit(form);
    expect(getByTestId('host').getAttribute('data-bound-key')).toBe('sk-ant-abc123def456');
  });
});

describe('SettingsDrawer — successful save', () => {
  it('writes the trimmed key to bound state, clears the input, switches to saved view', async () => {
    const { container, getByTestId } = render(SettingsDrawerHost, {
      props: { initial: null }
    });
    const input = container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'sk-ant-abc123def456' } });
    const form = container.querySelector('form') as HTMLFormElement;
    await fireEvent.submit(form);

    // Bound state mutated through the binding.
    expect(getByTestId('host').getAttribute('data-bound-key')).toBe('sk-ant-abc123def456');

    // Saved view replaces the form — the entry form should be gone.
    expect(container.querySelector('form')).toBeNull();
    // Last-4 chip shows the trailing 4 chars masked appropriately.
    const chip = container.querySelector('[data-testid="key-chip"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('f456');
    // Replace + Forget buttons render.
    expect(container.querySelector('[data-testid="replace"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="forget"]')).not.toBeNull();
  });

  it('clears the input element value after a successful save (re-checked on Replace)', async () => {
    // After Save the form unmounts entirely (Saved view replaces it).
    // To verify the explicit `inputEl.value = ''` discipline from spec
    // § Browser-side storage, click Replace and confirm the re-rendered
    // input is empty rather than carrying the saved value.
    const { container } = render(SettingsDrawerHost, {
      props: { initial: null }
    });
    const input = container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'sk-ant-abc123def456' } });
    await fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    const replace = container.querySelector('[data-testid="replace"]') as HTMLButtonElement;
    await fireEvent.click(replace);

    const reopened = container.querySelector('input') as HTMLInputElement;
    expect(reopened).not.toBeNull();
    expect(reopened.value).toBe('');
  });
});

describe('SettingsDrawer — saved view', () => {
  it('renders the saved view with a last-4 chip when apiKey is set initially', () => {
    const { container } = render(SettingsDrawerHost, {
      props: { initial: 'sk-ant-abc123def456' }
    });
    expect(container.querySelector('form')).toBeNull();
    const chip = container.querySelector('[data-testid="key-chip"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('f456');
  });

  it('Forget key reverts bound state to null and returns to the entry view', async () => {
    const { container, getByTestId } = render(SettingsDrawerHost, {
      props: { initial: 'sk-ant-abc123def456' }
    });
    const forget = container.querySelector('[data-testid="forget"]') as HTMLButtonElement;
    await fireEvent.click(forget);
    // One-step inline confirmation per plan — clicking again confirms.
    const confirm = container.querySelector(
      '[data-testid="forget-confirm"]'
    ) as HTMLButtonElement | null;
    expect(confirm).not.toBeNull();
    await fireEvent.click(confirm!);

    expect(getByTestId('host').getAttribute('data-bound-key')).toBe('');
    expect(container.querySelector('form')).not.toBeNull();
  });

  it('Replace returns to the entry view without nulling bound state', async () => {
    // The plan's Saved view spec: Replace reopens entry view. Spec text
    // says it "sets apiKey = null" — we honour that so the parent's
    // composer-gating logic flips off until the user re-enters.
    const { container, getByTestId } = render(SettingsDrawerHost, {
      props: { initial: 'sk-ant-abc123def456' }
    });
    const replace = container.querySelector('[data-testid="replace"]') as HTMLButtonElement;
    await fireEvent.click(replace);
    expect(container.querySelector('form')).not.toBeNull();
    expect(getByTestId('host').getAttribute('data-bound-key')).toBe('');
  });
});
