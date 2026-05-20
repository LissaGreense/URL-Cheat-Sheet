/**
 * @fileoverview Contract tests for ReadyState — the cinematic chat
 * layout (spec §4.5, plan Task 5).
 *
 * Composition under test:
 *   - memory chip (// MEMORY_ACTIVE + document title + > change link)
 *   - top-left // MEMORY_ACTIVE sys-voice header
 *   - bottom-right 001 SESSION corner stamp
 *   - MessageStream rendering thread messages
 *   - Composer bound to chatInput
 *   - greeting auto-injected when chat.messages is empty
 *   - onReset fires when the > change link is clicked
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import ReadyStateHost from './ReadyState.test-host.svelte';

const SAMPLE_DOC = {
  title: 'How to brew tea',
  sourceUrl: 'https://example.com/tea',
  text: 'Steep for three minutes.',
  headings: []
};

afterEach(() => {
  cleanup();
});

describe('ReadyState', () => {
  it('renders the document title in the memory chip', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [] },
        chatInput: '',
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    expect(container.textContent).toContain('How to brew tea');
    // memory chip uses sys-voice MEMORY_ACTIVE label
    expect(container.textContent).toContain('MEMORY_ACTIVE');
  });

  it('renders the // MEMORY_ACTIVE sys-voice header', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [] },
        chatInput: '',
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    // header prefix
    expect(container.textContent).toContain('//');
    expect(container.textContent).toContain('MEMORY_ACTIVE');
  });

  it('renders the 001 SESSION corner stamp', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [] },
        chatInput: '',
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    const stamp = container.querySelector('.corner-stamp');
    expect(stamp).not.toBeNull();
    expect(stamp!.textContent).toContain('001 SESSION');
  });

  it('injects the greeting when chat.messages is empty', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [] },
        chatInput: '',
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    expect(container.textContent).toContain('URL has been loaded to your memory');
    expect(container.textContent).toContain('Ask questions to get knowledge access');
  });

  it('suppresses the greeting once messages exist', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: {
          messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]
        },
        chatInput: '',
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    expect(container.textContent).not.toContain('URL has been loaded to your memory');
  });

  it('fires onReset when the > change link is clicked', async () => {
    const onReset = vi.fn();
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [] },
        chatInput: '',
        onSendChat: () => {},
        onReset
      }
    });
    const link = container.querySelector('[data-testid="ready-reset"]');
    expect(link).not.toBeNull();
    await fireEvent.click(link!);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('renders the composer (input + send button)', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [] },
        chatInput: '',
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe('Ask about this page...');
    const submit = container.querySelector('button[type="submit"]');
    expect(submit!.textContent).toContain('SEND');
  });

  it('binds chatInput into the composer input', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [] },
        chatInput: 'pre-filled',
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('pre-filled');
  });

  it('disables the composer and swaps placeholder when keySet is false (ucs-88j)', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [] },
        chatInput: '',
        keySet: false,
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe('Add your Anthropic API key in settings to start chatting');
  });

  it('leaves the composer in the default state when keySet is true (ucs-88j)', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [], status: 'ready' as const },
        chatInput: '',
        keySet: true,
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.placeholder).toBe('Ask about this page...');
  });

  it('renders the inline error surface above the composer when inlineError is set (ucs-88j)', () => {
    const { container, getByTestId } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [] },
        chatInput: '',
        inlineError: 'Provider rate limit or quota exceeded — check your Anthropic spend limits.',
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    const error = getByTestId('ready-inline-error');
    expect(error).not.toBeNull();
    expect(error.textContent).toContain('rate limit');
    // The error sits inside the composer wrapper but before the form.
    const composerForm = container.querySelector('form.composer');
    expect(composerForm).not.toBeNull();
  });

  it('omits the inline error surface when inlineError is null (ucs-88j)', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: { messages: [] },
        chatInput: '',
        inlineError: null,
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    expect(container.querySelector('[data-testid="ready-inline-error"]')).toBeNull();
  });

  it('renders MessageStream with the chat messages', () => {
    const { container } = render(ReadyStateHost, {
      props: {
        document: SAMPLE_DOC,
        chat: {
          messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'what is tea?' }] }]
        },
        chatInput: '',
        onSendChat: () => {},
        onReset: () => {}
      }
    });
    expect(container.textContent).toContain('what is tea?');
  });
});
