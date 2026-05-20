/**
 * @fileoverview Contract tests for FinalizeScan — the static Phase 1
 * interior for the `finalize` sentinel tool (spec §5.2, plan Task 5).
 *
 * `finalize` is a *client-side* sentinel tool (see
 * `packages/agent/src/tools/finalize.ts`) — it has no `execute`. The
 * model fills `input.answer` and `input.citations`, the SDK streams
 * them into the chat as a `tool-finalize` part, and the client renders
 * `input.answer` verbatim. There is no `output` to read.
 *
 * Behaviour under test:
 *   - `part.state` maps to the correct status string + tone
 *   - `part.input?.answer` renders verbatim
 *   - `part.input?.citations` render in a bracketed footer when present
 *   - `output-error` state surfaces FAULTED + error glyph
 *
 * Phase 1 ships chrome only — no compile-bar animation.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import type { ToolUIPart } from 'ai';
import FinalizeScan from './FinalizeScan.svelte';

/**
 * Narrowed `tool-finalize` part type. We parameterize `ToolUIPart` with
 * a single-entry tools record so the resulting union has exactly one
 * discriminant (`type: 'tool-finalize'`) with the input/output shape
 * the `finalize` sentinel tool actually carries (see
 * `packages/agent/src/tools/finalize.ts`).
 *
 * `output` is typed `unknown` to match `UITool`'s base — the sentinel
 * has no `execute`, so the live UI never sees a populated `output`.
 */
type FinalizeTools = {
  finalize: {
    input: { answer?: string; citations?: string[] };
    output: unknown;
  };
};
type FinalizePart = ToolUIPart<FinalizeTools>;

/**
 * Helper — build a minimal `tool-finalize` part for the test. The
 * `ToolUIPart` discriminated union is wide enough that a narrow factory
 * keeps each call site readable. We assemble loosely (Record<string,
 * unknown>) then cast to the narrowed `FinalizePart` at the boundary —
 * the cast is sound because we only emit the shapes the union allows.
 */
function fakePart(input: {
  state: string;
  answer?: string;
  citations?: string[];
  errorText?: string;
}): FinalizePart {
  // Assembled via bracket access — `noPropertyAccessFromIndexSignature: true`
  // (set in the repo's strict baseline) requires bracket form for any
  // property that comes from an index signature, which is exactly what
  // `Record<string, unknown>` is.
  const part: Record<string, unknown> = {
    type: 'tool-finalize',
    toolCallId: 'call_1',
    state: input.state
  };
  if (input.state === 'output-error') {
    part['input'] = input.answer ? { answer: input.answer } : undefined;
    part['errorText'] = input.errorText ?? 'tool failed';
  } else {
    part['input'] = {
      answer: input.answer,
      citations: input.citations ?? []
    };
  }
  return part as FinalizePart;
}

afterEach(() => {
  cleanup();
});

describe('FinalizeScan', () => {
  it('maps state="input-streaming" → [ COMPILING ]', () => {
    const { container } = render(FinalizeScan, {
      props: { part: fakePart({ state: 'input-streaming', answer: 'partial answer' }) }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ COMPILING ]');
  });

  it('maps state="input-available" → [ COMPLETE ]', () => {
    const { container } = render(FinalizeScan, {
      props: { part: fakePart({ state: 'input-available', answer: 'final answer' }) }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ COMPLETE ]');
  });

  it('maps state="output-available" → [ COMPLETE ]', () => {
    const { container } = render(FinalizeScan, {
      props: { part: fakePart({ state: 'output-available', answer: 'final answer' }) }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ COMPLETE ]');
  });

  it('maps state="output-error" → [ FAULTED ] in alarm tone with error glyph', () => {
    const { container } = render(FinalizeScan, {
      props: { part: fakePart({ state: 'output-error' }) }
    });
    const pill = container.querySelector('.status-pill');
    expect(pill!.textContent?.trim()).toBe('[ FAULTED ]');
    expect(pill!.classList.contains('status-pill--alarm')).toBe(true);
    expect(container.querySelector('.scan-card__error-glyph')).not.toBeNull();
  });

  it('renders the FINALIZE tool name in the header', () => {
    const { container } = render(FinalizeScan, {
      props: { part: fakePart({ state: 'input-streaming', answer: 'x' }) }
    });
    expect(container.textContent).toContain('FINALIZE');
  });

  it('reads part.input.answer (NOT part.output) and renders verbatim', () => {
    // The critical invariant: finalize is a client-side sentinel — its
    // `input.answer` IS the rendered answer. Asserting we don't try to
    // read part.output.
    const { container } = render(FinalizeScan, {
      props: {
        part: fakePart({
          state: 'input-available',
          answer: 'The tea is steeped for 3 minutes.'
        })
      }
    });
    expect(container.textContent).toContain('The tea is steeped for 3 minutes.');
  });

  it('ignores part.output even when present — finalize is input-only', () => {
    // Sentinel contract pin: the `finalize` tool has no `execute`, so
    // the SDK should never populate `part.output` — but if a future
    // refactor wires one in by accident, the component must NOT render
    // it. We construct a part with a populated `output` and an empty
    // `input.answer` and assert the output string never reaches the DOM.
    const SENTINEL_OUTPUT_TEXT = '__SHOULD_NOT_RENDER_THIS_OUTPUT__';
    const part = {
      type: 'tool-finalize',
      toolCallId: 'call_1',
      state: 'output-available',
      input: { answer: undefined, citations: [] },
      output: { answer: SENTINEL_OUTPUT_TEXT, text: SENTINEL_OUTPUT_TEXT }
    } as unknown as FinalizePart;
    const { container } = render(FinalizeScan, { props: { part } });
    expect(container.textContent ?? '').not.toContain(SENTINEL_OUTPUT_TEXT);
    // Pill should still reflect the COMPLETE state — chrome unaffected.
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ COMPLETE ]');
  });

  it('renders streaming answer text while state="input-streaming"', () => {
    const { container } = render(FinalizeScan, {
      props: {
        part: fakePart({ state: 'input-streaming', answer: 'Partial...' })
      }
    });
    expect(container.textContent).toContain('Partial...');
  });

  it('renders citations footer when present', () => {
    const { container } = render(FinalizeScan, {
      props: {
        part: fakePart({
          state: 'input-available',
          answer: 'Final answer.',
          citations: ['§1', '§3']
        })
      }
    });
    const footer = container.querySelector('.finalize__citations');
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain('citations');
    expect(footer!.textContent).toContain('§1');
    expect(footer!.textContent).toContain('§3');
  });

  it('omits citations footer when citations array is empty', () => {
    const { container } = render(FinalizeScan, {
      props: {
        part: fakePart({
          state: 'input-available',
          answer: 'Final answer.',
          citations: []
        })
      }
    });
    expect(container.querySelector('.finalize__citations')).toBeNull();
  });

  it('renders empty answer placeholder when input is absent during streaming', () => {
    // input-streaming with no answer yet — should still render the card
    // without crashing (the v1 +page.svelte rendered "Thinking…" here
    // as a muted placeholder; the new component just renders the card
    // with no text — the parent MessageStream surfaces the "Thinking…"
    // sys-voice line elsewhere).
    const { container } = render(FinalizeScan, {
      props: { part: fakePart({ state: 'input-streaming' }) }
    });
    expect(container.querySelector('.status-pill')!.textContent?.trim()).toBe('[ COMPILING ]');
  });

  it('renders a .compile-bar child so assembleCascade has a target', () => {
    const { container } = render(FinalizeScan, {
      props: { part: fakePart({ state: 'input-streaming', answer: 'streaming...' }) }
    });
    expect(container.querySelector('.compile-bar')).not.toBeNull();
  });

  it('renders a .finalize__content text container so the per-line observer can wire up', () => {
    const { container } = render(FinalizeScan, {
      props: { part: fakePart({ state: 'input-streaming', answer: 'a' }) }
    });
    expect(container.querySelector('.finalize__content')).not.toBeNull();
  });

  it('renders each answer line as a .finalize__line element (final state)', () => {
    const { container } = render(FinalizeScan, {
      props: {
        part: fakePart({
          state: 'input-available',
          answer: 'line one\nline two\nline three'
        })
      }
    });
    const lines = container.querySelectorAll('.finalize__line');
    expect(lines.length).toBe(3);
    expect(lines[0]!.textContent).toBe('line one');
    expect(lines[2]!.textContent).toBe('line three');
  });

  it('renders completed lines + a separate live tail during input-streaming', () => {
    // Mid-stream: one full newline-terminated line + a still-growing tail.
    // The per-line scramble should target only the FINAL nodes, not the
    // mutating tail. Asserted via class separation.
    const { container } = render(FinalizeScan, {
      props: {
        part: fakePart({
          state: 'input-streaming',
          answer: 'line one\nhalf-stre'
        })
      }
    });
    const lines = container.querySelectorAll('.finalize__line');
    expect(lines.length).toBe(1);
    expect(lines[0]!.textContent).toBe('line one');
    const tail = container.querySelector('.finalize__tail');
    expect(tail).not.toBeNull();
    expect(tail!.textContent).toBe('half-stre');
  });

  it('exposes part.state via data-state on the host for failure / cancellation CSS', () => {
    const { container } = render(FinalizeScan, {
      props: { part: fakePart({ state: 'output-error' }) }
    });
    const host = container.querySelector('.finalize');
    expect(host?.getAttribute('data-state')).toBe('output-error');
  });
});
