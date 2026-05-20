/**
 * @fileoverview Contract tests for MessageStream — the assistant-thread
 * renderer (spec §4.5, plan Task 5).
 *
 * Critical reactivity rule: MessageStream takes the live `Chat`
 * instance (NOT `chat.messages`) and reads `chat.messages` directly
 * inside its template. Destructuring at the prop boundary would lose
 * Svelte 5 reactivity for incoming SSE tokens. The host below passes
 * a duck-typed `{ messages }` object — sufficient because the component
 * doesn't call any Chat methods.
 *
 * Behaviour under test:
 *   - user messages render right-aligned with the `> ` sys-voice prefix
 *   - assistant messages render left-aligned, no role label
 *   - `tool-grep_doc` parts route to GrepDocScan (status pill present)
 *   - `tool-finalize` parts route to FinalizeScan (FINALIZE header present)
 *   - `text` parts render verbatim
 *   - awaiting-assistant true → "Thinking…" placeholder appears
 *   - unknown tool types are NOT rendered with debug JSON in prod
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import MessageStreamHost from './MessageStream.test-host.svelte';

afterEach(() => {
  cleanup();
});

/**
 * Minimal message factory — id + role + parts.
 *
 * The return type matches the test-host's `MockMessage` shape (which
 * uses `ReadonlyArray<Record<string, unknown>>` so callers can pass
 * tuple-built arrays without worrying about variance). The test-host
 * casts to the wider Chat-derived type at the forward boundary — see
 * `MessageStream.test-host.svelte` for the rationale.
 */
function msg(
  id: string,
  role: 'user' | 'assistant',
  parts: Array<Record<string, unknown>>
): {
  id: string;
  role: 'user' | 'assistant';
  parts: ReadonlyArray<Record<string, unknown>>;
} {
  return { id, role, parts };
}

describe('MessageStream', () => {
  it('renders nothing user-visible when messages is empty + not awaiting', () => {
    const { container } = render(MessageStreamHost, {
      props: { chat: { messages: [] }, awaitingAssistant: false }
    });
    // Empty thread — the <ol> shell is present but has no children.
    const items = container.querySelectorAll('.message-stream__item');
    expect(items.length).toBe(0);
  });

  it('renders a user message right-aligned with the > sys-voice prefix', () => {
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [msg('m1', 'user', [{ type: 'text', text: 'what is tea?' }])]
        },
        awaitingAssistant: false
      }
    });
    const item = container.querySelector('.message-stream__item--user');
    expect(item).not.toBeNull();
    expect(item!.textContent).toContain('what is tea?');
    // user prefix: `>` glyph from sys-voice.
    expect(item!.textContent).toContain('>');
  });

  it('renders an assistant message left-aligned with no role label', () => {
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [msg('m1', 'assistant', [{ type: 'text', text: 'tea is hot.' }])]
        },
        awaitingAssistant: false
      }
    });
    const item = container.querySelector('.message-stream__item--assistant');
    expect(item).not.toBeNull();
    expect(item!.textContent).toContain('tea is hot.');
    // No "assistant" or "user" word as a role label on the assistant line.
    // The previous monolithic +page.svelte had a `<span class="role">`
    // for both; the new contract removes it for assistant lines.
    expect(item!.querySelector('.message-stream__role')).toBeNull();
  });

  it('routes tool-grep_doc parts to GrepDocScan', () => {
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [
            msg('m1', 'assistant', [
              {
                type: 'tool-grep_doc',
                toolCallId: 'c1',
                state: 'input-streaming',
                input: { pattern: 'tea' }
              }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    // GrepDocScan renders the GREP_DOC header inside a status pill block.
    expect(container.textContent).toContain('GREP_DOC');
    expect(container.querySelector('.status-pill')).not.toBeNull();
  });

  /**
   * ucs-m97 regression. The grep_doc tool's input shape is
   * `{ pattern: string }` (see packages/agent/src/tools/grep-doc.ts —
   * renamed from `query` in ucs-8nl / PR #120). MessageStream's
   * queryFor must read `input.pattern`, or the GREP_DOC scan card
   * renders `q: ""` for every search.
   */
  it('renders the actual pattern inside the GREP_DOC card (ucs-m97)', () => {
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [
            msg('m1', 'assistant', [
              {
                type: 'tool-grep_doc',
                toolCallId: 'c1',
                state: 'input-available',
                input: { pattern: 'hypertext' }
              }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    const queryText = container.querySelector('.grep-doc__query-text');
    expect(queryText?.textContent).toBe('"hypertext"');
  });

  it('renders pipe-separated alternatives verbatim (ucs-m97)', () => {
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [
            msg('m1', 'assistant', [
              {
                type: 'tool-grep_doc',
                toolCallId: 'c1',
                state: 'input-available',
                input: { pattern: 'error|exception|fault' }
              }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    const queryText = container.querySelector('.grep-doc__query-text');
    expect(queryText?.textContent).toBe('"error|exception|fault"');
  });

  it('routes tool-finalize parts to FinalizeScan', () => {
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [
            msg('m1', 'assistant', [
              {
                type: 'tool-finalize',
                toolCallId: 'c1',
                state: 'input-available',
                input: { answer: 'the answer', citations: [] }
              }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    expect(container.textContent).toContain('FINALIZE');
    expect(container.textContent).toContain('the answer');
  });

  it('shows a sys-voice "Thinking…" placeholder when awaitingAssistant is true', () => {
    const { container } = render(MessageStreamHost, {
      props: {
        chat: { messages: [msg('m1', 'user', [{ type: 'text', text: 'q' }])] },
        awaitingAssistant: true
      }
    });
    const placeholder = container.querySelector('.message-stream__awaiting');
    expect(placeholder).not.toBeNull();
    // sys-voice register caps the text, so the rendered string is `THINKING…`.
    expect(placeholder!.textContent?.toUpperCase()).toContain('THINKING');
  });

  it('hides the "Thinking…" placeholder when awaitingAssistant is false', () => {
    const { container } = render(MessageStreamHost, {
      props: {
        chat: { messages: [msg('m1', 'user', [{ type: 'text', text: 'q' }])] },
        awaitingAssistant: false
      }
    });
    expect(container.querySelector('.message-stream__awaiting')).toBeNull();
  });

  it('does not render a debug JSON fallback for unknown tool types', () => {
    // spec §5.5: no tool should fall back to default <pre>{JSON}</pre>
    // in production. The component logs to console + renders nothing.
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [
            msg('m1', 'assistant', [
              { type: 'tool-mystery', toolCallId: 'c1', state: 'input-available', input: {} }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    // No <pre> tags with raw JSON.
    expect(container.querySelector('pre')).toBeNull();
  });

  it('renders multiple parts within a single assistant message in order', () => {
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [
            msg('m1', 'assistant', [
              {
                type: 'tool-grep_doc',
                toolCallId: 'c1',
                state: 'output-available',
                input: { pattern: 'tea' },
                output: { hits: 2 }
              },
              { type: 'text', text: 'tea is hot.' }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    const text = container.textContent ?? '';
    expect(text.indexOf('GREP_DOC')).toBeLessThan(text.indexOf('tea is hot.'));
  });
});
