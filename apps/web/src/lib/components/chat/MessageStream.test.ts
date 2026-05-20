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

  it('renders the grep_doc query verbatim from input.pattern (string form)', () => {
    // Regression: ucs-aoo — an earlier mapper read `input.query` and
    // silently rendered `q: ""`. The tool schema is `pattern: string |
    // string[]`, so the mapper must read `pattern`.
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [
            msg('m1', 'assistant', [
              {
                type: 'tool-grep_doc',
                toolCallId: 'c1',
                state: 'input-available',
                input: { pattern: 'status code' }
              }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    expect(container.textContent).toContain('"status code"');
  });

  it('renders the grep_doc query as a `|`-joined string for the array (OR-union) form', () => {
    // Tool schema accepts `pattern: string[]` for synonym exploration
    // (ucs-0f3). The OR semantics are visualized as ` | `-joined.
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [
            msg('m1', 'assistant', [
              {
                type: 'tool-grep_doc',
                toolCallId: 'c1',
                state: 'input-available',
                input: { pattern: ['error', 'exception', 'fault'] }
              }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    expect(container.textContent).toContain('"error | exception | fault"');
  });

  it('renders the grep_doc hit count from output.matches.length on completion', () => {
    // Regression: ucs-ozi — an earlier mapper read `output.hits` and
    // silently rendered `0 HITS` for every completed scan. Tool returns
    // `{ matches: GrepMatch[] }` (packages/agent/src/tools/grep-doc.ts).
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
                output: {
                  matches: [
                    { line: 1, text: 'a', before: [], after: [] },
                    { line: 5, text: 'b', before: [], after: [] }
                  ]
                }
              }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ 2 HITS ]');
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
                output: { matches: [{ line: 1, text: 'tea', before: [], after: [] }] }
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

  it('routes tool-outline parts to OutlineScan', () => {
    // ucs-8n1 close-out: outline is one of two new tool routes added
    // alongside grep_doc + finalize. The header label and the rendered
    // headings list are the load-bearing evidence the route fired.
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [
            msg('m1', 'assistant', [
              {
                type: 'tool-outline',
                toolCallId: 'c1',
                state: 'output-available',
                input: {},
                output: {
                  headings: [
                    { text: 'Intro', level: 1, line: 1 },
                    { text: 'Body', level: 2, line: 10 }
                  ]
                }
              }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    expect(container.textContent).toContain('OUTLINE');
    expect(container.querySelector('.outline__list')).not.toBeNull();
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ 2 SECTIONS ]');
  });

  it('routes tool-read_lines parts to ReadLinesScan', () => {
    // ucs-8n1 close-out: read_lines is the second new route. The <pre>
    // block with the verbatim `Lxx | ` prefix is the load-bearing
    // evidence the snippet text reached the DOM.
    const { container } = render(MessageStreamHost, {
      props: {
        chat: {
          messages: [
            msg('m1', 'assistant', [
              {
                type: 'tool-read_lines',
                toolCallId: 'c1',
                state: 'output-available',
                input: { start: 10, end: 11 },
                output: { text: 'L10 | a\nL11 | b', truncated: false }
              }
            ])
          ]
        },
        awaitingAssistant: false
      }
    });
    expect(container.textContent).toContain('READ_LINES');
    const pre = container.querySelector('pre.read-lines__text');
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain('L10 | a');
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ L10–L11 ]');
  });

  it('does not log a console warning for known tool types (regression: ucs-8n1)', async () => {
    // Pre-fix, MessageStream warned per unknown-tool part and produced
    // 210+ warnings per chat turn because outline + read_lines were
    // routed to the unknown branch. After ucs-8n1 the four shipped tools
    // each have a route and the unknown branch is silent — both
    // expectations matter, so we assert console.warn is never called
    // for a turn that contains all four routes.
    const { vi } = await import('vitest');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(MessageStreamHost, {
        props: {
          chat: {
            messages: [
              msg('m1', 'assistant', [
                {
                  type: 'tool-grep_doc',
                  toolCallId: 'c1',
                  state: 'output-available',
                  input: { pattern: 'tea' },
                  output: { matches: [] }
                },
                {
                  type: 'tool-outline',
                  toolCallId: 'c2',
                  state: 'output-available',
                  input: {},
                  output: { headings: [] }
                },
                {
                  type: 'tool-read_lines',
                  toolCallId: 'c3',
                  state: 'output-available',
                  input: { start: 1, end: 2 },
                  output: { text: '', truncated: false }
                },
                {
                  type: 'tool-finalize',
                  toolCallId: 'c4',
                  state: 'input-available',
                  input: { answer: 'done', citations: [] }
                }
              ])
            ]
          },
          awaitingAssistant: false
        }
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
