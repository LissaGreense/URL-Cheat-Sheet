/**
 * @fileoverview Contract tests for Composer — the HUD-wrapped chat
 * input + send button (spec §4.5, plan Task 5).
 *
 * Behaviour under test:
 *   - HudPanel wraps the input
 *   - "Ask about this page..." placeholder renders
 *   - `value` is bindable — typing updates the bound value
 *   - submit fires onSubmit with a SubmitEvent
 *   - `disabled` blocks both the input and the submit button
 *   - SEND sys-voice action label renders on the submit button
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import ComposerHost from './Composer.test-host.svelte';

afterEach(() => {
  cleanup();
});

describe('Composer', () => {
  it('renders inside a HudPanel', () => {
    const { container } = render(ComposerHost, {
      props: { value: '', onSubmit: () => {} }
    });
    expect(container.querySelector('.hud-panel')).not.toBeNull();
  });

  it('renders the "Ask about this page..." placeholder', () => {
    const { container } = render(ComposerHost, {
      props: { value: '', onSubmit: () => {} }
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.placeholder).toBe('Ask about this page...');
  });

  it('reflects the initial value in the input', () => {
    const { container } = render(ComposerHost, {
      props: { value: 'hello', onSubmit: () => {} }
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  it('updates the bound value when the user types', async () => {
    const { container } = render(ComposerHost, {
      props: { value: '', onSubmit: () => {} }
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'tea' } });
    expect(input.value).toBe('tea');
  });

  it('fires onSubmit when the form is submitted', async () => {
    const onSubmit = vi.fn();
    const { container } = render(ComposerHost, {
      props: { value: 'tea', onSubmit }
    });
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    await fireEvent.submit(form!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toBeInstanceOf(Event);
  });

  it('disables the input when disabled=true', () => {
    const { container } = render(ComposerHost, {
      props: { value: '', disabled: true, onSubmit: () => {} }
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('disables the submit button when disabled=true', () => {
    const { container } = render(ComposerHost, {
      props: { value: 'tea', disabled: true, onSubmit: () => {} }
    });
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('disables the submit button when value is empty/whitespace', () => {
    const { container } = render(ComposerHost, {
      props: { value: '   ', onSubmit: () => {} }
    });
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('enables the submit button when value has non-whitespace content', () => {
    const { container } = render(ComposerHost, {
      props: { value: 'tea', onSubmit: () => {} }
    });
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('renders the SEND sys-voice action label', () => {
    const { container } = render(ComposerHost, {
      props: { value: 'tea', onSubmit: () => {} }
    });
    const submit = container.querySelector('button[type="submit"]');
    expect(submit!.textContent).toContain('SEND');
    // SysLabel kind="action" emits the `>` prefix.
    expect(submit!.textContent).toContain('>');
  });
});
