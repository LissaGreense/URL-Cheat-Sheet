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

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import MessageStreamHost from './MessageStream.test-host.svelte';
import MessageStreamStreamingHost from './MessageStream.streaming-host.svelte';

// Force the reduced-motion path inside scrambleIn for the mid-stream
// mutation tests below: the motion path schedules GSAP tweens whose
// ScrambleTextPlugin is unregistered under jsdom (gsap.to no-ops), so
// it never actually writes the post-mount text into the DOM and the
// pill freeze the test is trying to catch would be masked by the
// jsdom-only "GSAP didn't run, textContent never updated" behavior.
// In the reduced-motion branch the action writes node.textContent
// synchronously on mount AND on every update — which is exactly the
// production contract we need to assert (the pill text follows the
// reactive `state` prop). ADR 0009 strict fallback.
vi.mock('../../motion/_reducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => true)
}));

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

/**
 * Mid-stream mutation tests (ucs-6j9 regression guard).
 *
 * The freeze symptom only surfaces when `message.parts` is mutated
 * after mount in the same shape the AI SDK uses: append new parts via
 * `parts.push(...)` while simultaneously flipping in-place `part.state`
 * on existing entries. Static-render tests can't catch DOM-reuse
 * footguns from index-keyed `{#each}` blocks — those only show up when
 * the array grows after the first paint and Svelte has to reconcile
 * new vs. existing keys.
 *
 * MessageStream now keys parts by `toolCallId` (with a composite
 * fallback for non-tool parts), so each logical tool call gets its own
 * stable component instance. The tests below assert the visible pill
 * text matches the underlying `part.state` for EVERY card, including
 * ones added mid-stream and ones whose state advanced after a sibling
 * was added.
 */
describe('MessageStream — mid-stream mutation (ucs-6j9 regression)', () => {
  // GREP_DOC states emit `[ SCANNING ]` while input streams and
  // `[ N HITS ]` once `output-available` lands. The pill text is the
  // load-bearing evidence the StatusPill's reactivity didn't freeze.
  it('advances every grep_doc pill text when many tool parts are appended and then resolved', async () => {
    // Phase 1: mount with the user message + an empty assistant message.
    // The assistant message's parts will be filled by the simulated
    // stream below.
    let api: {
      messages: Array<{
        id: string;
        role: 'user' | 'assistant';
        parts: Array<Record<string, unknown>>;
      }>;
    } | null = null;
    const { container } = render(MessageStreamStreamingHost, {
      props: {
        initialMessages: [
          { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'find every section' }] },
          { id: 'a1', role: 'assistant', parts: [] }
        ],
        onMounted: (handle) => {
          api = handle;
        }
      }
    });

    // onMount runs synchronously in @testing-library/svelte's render —
    // tick once to flush the post-mount effect.
    await tick();
    expect(api).not.toBeNull();

    const assistantParts = api!.messages[1]!.parts;

    // Phase 2: append 12 grep_doc parts in `input-streaming` state — the
    // same volume the QA repro hit. The pills should all show SCANNING.
    for (let n = 0; n < 12; n++) {
      assistantParts.push({
        type: 'tool-grep_doc',
        toolCallId: `call-${n}`,
        state: 'input-streaming',
        input: { pattern: `pattern-${n}` }
      });
      // tick after every push so Svelte mounts the new GrepDocScan
      // before the next mutation lands — mirrors the SSE-chunk cadence.
      await tick();
    }

    // Sanity: every appended pill rendered.
    {
      const pills = container.querySelectorAll('.status-pill');
      expect(pills.length).toBe(12);
      pills.forEach((p) => expect(p.textContent?.trim()).toBe('[ SCANNING ]'));
    }

    // Phase 3: resolve each tool call in order with a hit count derived
    // from its index, mutating `part.state` + `part.output` in place
    // (exactly the AI SDK `updateToolPart` pattern). After each tick,
    // the corresponding pill MUST advance to `[ <n> HITS ]`.
    for (let n = 0; n < 12; n++) {
      const part = assistantParts[n] as Record<string, unknown>;
      part['state'] = 'output-available';
      part['output'] = {
        matches: Array.from({ length: n + 1 }, (_, j) => ({
          line: j + 1,
          text: `m${j}`,
          before: [],
          after: []
        }))
      };
      await tick();
    }

    // Phase 4: verify every pill reached its terminal `[ <n> HITS ]`
    // text. This is the load-bearing assertion — pre-fix, pills 7-11
    // froze at `[ SCANNING ]` because the index-keyed each block let
    // their scrambleIn-managed text node hold stale content while
    // newer mounts grabbed it. With toolCallId keying, every card's
    // pill carries its own scrambleIn instance and tween budget.
    const pills = container.querySelectorAll('.status-pill');
    expect(pills.length).toBe(12);
    pills.forEach((pill, idx) => {
      expect(pill.textContent?.trim()).toBe(`[ ${idx + 1} HITS ]`);
    });
  });

  it('advances finalize pill from COMPILING to COMPLETE after sibling tool calls are appended (ucs-6j9 surface)', async () => {
    // The QA repro showed FinalizeScan stuck at `[ COMPILING ]` even
    // though the host div's `data-state` advanced to `input-available`.
    // This test mounts a turn that ends with a finalize part, then
    // toggles its state in place — the pill MUST end on COMPLETE.
    let api: {
      messages: Array<{
        id: string;
        role: 'user' | 'assistant';
        parts: Array<Record<string, unknown>>;
      }>;
    } | null = null;
    const { container } = render(MessageStreamStreamingHost, {
      props: {
        initialMessages: [
          { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'finalize after tools' }] },
          { id: 'a1', role: 'assistant', parts: [] }
        ],
        onMounted: (handle) => {
          api = handle;
        }
      }
    });
    await tick();

    const assistantParts = api!.messages[1]!.parts;

    // Append a few grep_doc calls first (so the finalize is NOT at
    // index 0 — the freeze symptom required later positions).
    for (let n = 0; n < 6; n++) {
      assistantParts.push({
        type: 'tool-grep_doc',
        toolCallId: `g-${n}`,
        state: 'output-available',
        input: { pattern: `p-${n}` },
        output: { matches: [] }
      });
      await tick();
    }

    // Now append the finalize sentinel.
    assistantParts.push({
      type: 'tool-finalize',
      toolCallId: 'finalize-1',
      state: 'input-streaming',
      input: { answer: 'partial...', citations: [] }
    });
    await tick();

    const pillsAfterAppend = container.querySelectorAll('.status-pill');
    const finalizePillStreaming = pillsAfterAppend[pillsAfterAppend.length - 1];
    expect(finalizePillStreaming!.textContent?.trim()).toBe('[ COMPILING ]');

    // Advance the finalize part to `input-available` (terminal for the
    // client-side sentinel). The pill MUST advance to COMPLETE.
    const finalizePart = assistantParts[assistantParts.length - 1] as Record<string, unknown>;
    finalizePart['state'] = 'input-available';
    finalizePart['input'] = { answer: 'final answer text.', citations: [] };
    await tick();

    const pillsAfterFinalize = container.querySelectorAll('.status-pill');
    const finalizePill = pillsAfterFinalize[pillsAfterFinalize.length - 1];
    expect(finalizePill!.textContent?.trim()).toBe('[ COMPLETE ]');
  });
});
