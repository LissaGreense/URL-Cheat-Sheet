/**
 * @fileoverview Contract tests for CornerStamp — the persistent
 * corner version stamp from spec §2.4 (`001 SESSION`, fixed corners).
 *
 * The component must:
 *   - render `position: fixed` so it survives scroll
 *   - place itself at the correct corner per the `position` prop
 *   - render in sys-voice typography
 *
 * Positioning is set inline (via the `style` attribute) so jsdom can
 * observe it without resolved-CSS support. The four positions map to
 * a (top|bottom, left|right) pair.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import CornerStamp from './CornerStamp.svelte';

afterEach(() => {
  cleanup();
});

describe('CornerStamp', () => {
  it('renders the provided text', () => {
    const { container } = render(CornerStamp, {
      props: { text: '001 SESSION', position: 'bottom-right' }
    });
    const stamp = container.querySelector('.corner-stamp');
    expect(stamp).not.toBeNull();
    expect(stamp!.textContent?.trim()).toBe('001 SESSION');
  });

  it('uses position: fixed so it persists across scroll', () => {
    const { container } = render(CornerStamp, {
      props: { text: '001 SESSION', position: 'bottom-right' }
    });
    const stamp = container.querySelector('.corner-stamp') as HTMLElement;
    expect(stamp.style.position).toBe('fixed');
  });

  describe('position prop maps to the correct corner anchors', () => {
    it('places at top-left', () => {
      const { container } = render(CornerStamp, {
        props: { text: 'X', position: 'top-left' }
      });
      const stamp = container.querySelector('.corner-stamp') as HTMLElement;
      expect(stamp.style.top).not.toBe('');
      expect(stamp.style.left).not.toBe('');
      expect(stamp.style.bottom).toBe('');
      expect(stamp.style.right).toBe('');
    });

    it('places at top-right', () => {
      const { container } = render(CornerStamp, {
        props: { text: 'X', position: 'top-right' }
      });
      const stamp = container.querySelector('.corner-stamp') as HTMLElement;
      expect(stamp.style.top).not.toBe('');
      expect(stamp.style.right).not.toBe('');
      expect(stamp.style.bottom).toBe('');
      expect(stamp.style.left).toBe('');
    });

    it('places at bottom-left', () => {
      const { container } = render(CornerStamp, {
        props: { text: 'X', position: 'bottom-left' }
      });
      const stamp = container.querySelector('.corner-stamp') as HTMLElement;
      expect(stamp.style.bottom).not.toBe('');
      expect(stamp.style.left).not.toBe('');
      expect(stamp.style.top).toBe('');
      expect(stamp.style.right).toBe('');
    });

    it('places at bottom-right', () => {
      const { container } = render(CornerStamp, {
        props: { text: 'X', position: 'bottom-right' }
      });
      const stamp = container.querySelector('.corner-stamp') as HTMLElement;
      expect(stamp.style.bottom).not.toBe('');
      expect(stamp.style.right).not.toBe('');
      expect(stamp.style.top).toBe('');
      expect(stamp.style.left).toBe('');
    });
  });
});
