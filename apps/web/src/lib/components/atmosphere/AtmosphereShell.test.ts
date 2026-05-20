/**
 * @fileoverview Contract tests for AtmosphereShell — verifies the 5-layer
 * z-ordered atmosphere stack renders, children compose above the
 * layers (spec §2.3), and the Phase 2 / Task 12 motion wiring produces
 * the documented element counts (3 glow pads, 12 spec dots), an
 * inline SVG `<filter>` for the ambient layer, and the mobile fallback
 * that hides spec dots beyond the fourth.
 *
 * The motion contract itself (drift keyframes, reduced-motion
 * fallback) is enforced via CSS in `atmosphere.css` and is exercised
 * by the visual / DOM-level tests below — we assert the structural
 * surface that the CSS keys into, not the keyframe internals.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import AtmosphereShell from './AtmosphereShell.svelte';
import AtmosphereShellWithChild from './AtmosphereShell.test-host.svelte';

/**
 * Absolute path to `atmosphere.css` — used for the source-text
 * assertion that the mobile media-query gate sits where it should.
 * Read via `fs` so the test doesn't depend on Vite's `?raw` import
 * handling (which isn't a stable contract).
 */
const here = dirname(fileURLToPath(import.meta.url));
const ATMOSPHERE_CSS_PATH = resolve(here, '../../styles/atmosphere.css');

/**
 * Save + restore the global `matchMedia` so tests that patch it for
 * mobile/desktop assertions don't leak the patch into later tests.
 */
let originalMatchMedia: typeof window.matchMedia;

/**
 * Patch `window.matchMedia` so a single query returns `matches: true`
 * and every other query returns `matches: false`. Used to simulate the
 * mobile viewport (`(max-width: 768px)`) for the dot-visibility
 * assertions below.
 *
 * Returns a typed MediaQueryList stub — listener methods are no-ops
 * (no test fires a change event).
 */
function patchMatchMedia(matchingQuery: string): void {
  window.matchMedia = ((query: string): MediaQueryList => ({
    matches: query === matchingQuery,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  cleanup();
});

describe('AtmosphereShell', () => {
  it('renders the 5 atmosphere layers', () => {
    const { container } = render(AtmosphereShell);
    expect(container.querySelector('.atmosphere__base')).not.toBeNull();
    expect(container.querySelector('.atmosphere__ambient')).not.toBeNull();
    expect(container.querySelector('.atmosphere__glow-pad')).not.toBeNull();
    expect(container.querySelector('.atmosphere__spec-dot')).not.toBeNull();
    expect(container.querySelector('.atmosphere__scanline')).not.toBeNull();
  });

  it('includes the cursor-halo placeholder layer (Phase 2 wires motion)', () => {
    const { container } = render(AtmosphereShell);
    expect(container.querySelector('.atmosphere__cursor-halo')).not.toBeNull();
  });

  it('wraps the layers in the .atmosphere root container', () => {
    const { container } = render(AtmosphereShell);
    const root = container.querySelector('.atmosphere');
    expect(root).not.toBeNull();
    // All five named layers must be descendants of the root container.
    expect(root!.querySelector('.atmosphere__base')).not.toBeNull();
    expect(root!.querySelector('.atmosphere__ambient')).not.toBeNull();
    expect(root!.querySelector('.atmosphere__glow-pad')).not.toBeNull();
    expect(root!.querySelector('.atmosphere__spec-dot')).not.toBeNull();
    expect(root!.querySelector('.atmosphere__scanline')).not.toBeNull();
  });

  it('renders provided children above the atmosphere layers', () => {
    const { getByTestId, container } = render(AtmosphereShellWithChild);
    const child = getByTestId('atmosphere-child');
    expect(child).toBeTruthy();
    expect(child.textContent).toContain('payload');
    // Child must not live inside any of the layer divs — it sits above them.
    expect(child.closest('.atmosphere__base')).toBeNull();
    expect(child.closest('.atmosphere__ambient')).toBeNull();
    expect(child.closest('.atmosphere__glow-pad')).toBeNull();
    expect(child.closest('.atmosphere__spec-dot')).toBeNull();
    expect(child.closest('.atmosphere__scanline')).toBeNull();
    // But it should still be inside the overall .atmosphere container.
    expect(container.querySelector('.atmosphere')).not.toBeNull();
  });

  it('renders an inline SVG turbulence filter consumed by the ambient layer', () => {
    const { container } = render(AtmosphereShell);
    const filter = container.querySelector('filter#atmosphere-turbulence');
    expect(filter).not.toBeNull();
    // Spec §2.3 item 2: `feTurbulence baseFrequency="0.006" numOctaves="2"`.
    const turbulence = filter!.querySelector('feTurbulence');
    expect(turbulence).not.toBeNull();
    expect(turbulence!.getAttribute('baseFrequency')).toBe('0.006');
    expect(turbulence!.getAttribute('numOctaves')).toBe('2');
    // The displacement map is the second filter primitive.
    expect(filter!.querySelector('feDisplacementMap')).not.toBeNull();
  });

  it('renders three glow pads (spec §2.3 item 3 — Phase 2 expanded)', () => {
    const { container } = render(AtmosphereShell);
    const pads = container.querySelectorAll('.atmosphere__glow-pad');
    expect(pads.length).toBe(3);
  });

  it('renders twelve spec dots on desktop (matchMedia mobile = false)', () => {
    // Default jsdom matchMedia shim returns matches=false for every
    // query, which is the desktop case; assert explicitly for clarity.
    patchMatchMedia('(min-width: 769px)'); // anything that ISN'T the mobile breakpoint
    const { container } = render(AtmosphereShell);
    const dots = container.querySelectorAll('.atmosphere__spec-dot');
    expect(dots.length).toBe(12);
  });

  it('keeps 12 dots in the DOM and only hides via CSS on mobile', () => {
    // The CSS-driven mobile fallback uses `:nth-child(n+5) { display:
    // none }`; the component itself does NOT branch on viewport, so
    // the DOM count is 12 regardless. We assert that here so a future
    // accidental rewrite that swaps to a JS branch trips the test.
    patchMatchMedia('(max-width: 768px)');
    const { container } = render(AtmosphereShell);
    const dots = container.querySelectorAll('.atmosphere__spec-dot');
    expect(dots.length).toBe(12);
    // First four dots are the mobile-visible set; assert they exist.
    // CSS-level visibility is exercised in the next test.
    expect(dots[0]).toBeTruthy();
    expect(dots[3]).toBeTruthy();
  });

  it('mobile fallback CSS reduces visible spec dots to ≤6', () => {
    // The shell renders 12 dots; the CSS rule `:nth-child(n+5) {
    // display: none }` lives inside the `(max-width: 768px)` block in
    // atmosphere.css and hides dots 5-and-beyond. jsdom does NOT
    // evaluate `@media` queries against patched `matchMedia` — the
    // engine resolves media against its (unreachable) layout viewport
    // — so the meaningful in-test assertion is the bare nth-child
    // rule. We inject the rule without the media wrapper to verify
    // the SELECTOR (which is the load-bearing part) hides the right
    // dots; the media-query gating itself is a CSS-source-text
    // assertion (next test).
    patchMatchMedia('(max-width: 768px)');
    const style = document.createElement('style');
    style.textContent = `.atmosphere__spec-dot:nth-child(n + 5) { display: none; }`;
    document.head.appendChild(style);
    try {
      const { container } = render(AtmosphereShell);
      const dots = Array.from(container.querySelectorAll('.atmosphere__spec-dot'));
      const visible = dots.filter((dot) => {
        return window.getComputedStyle(dot).display !== 'none';
      });
      expect(visible.length).toBeLessThanOrEqual(6);
      // Sanity floor — the spec calls for 4–6 visible on mobile, so
      // anything below 4 means the CSS rule mis-hides.
      expect(visible.length).toBeGreaterThanOrEqual(4);
    } finally {
      document.head.removeChild(style);
    }
  });

  it('atmosphere.css gates the dot-hiding rule on the mobile media query', () => {
    // Belt-and-braces: read atmosphere.css and assert the
    // `nth-child(n + 5)` hiding rule is wrapped in `(max-width: 768px)`.
    // Source-text assertion because jsdom can't evaluate the media
    // query (see previous test). Catches regressions where the rule
    // accidentally moves out of the mobile block.
    const css = readFileSync(ATMOSPHERE_CSS_PATH, 'utf8');
    expect(css).toMatch(/@media\s*\(max-width:\s*768px\)/);
    // The mobile block must contain the dot-hiding rule. Match the
    // block contents up to the matching closing brace at column 0.
    const mobileBlockMatch = css.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}/);
    expect(mobileBlockMatch).not.toBeNull();
    expect(mobileBlockMatch![1]).toMatch(/atmosphere__spec-dot:nth-child\(n\s*\+\s*5\)/);
  });

  it('atmosphere.css gates the three drift animations on prefers-reduced-motion: no-preference', () => {
    // ADR 0009 strict fallback: reduced-motion users must skip the
    // three drift `animation:` declarations entirely. The motion-
    // allowed block at ~line 302 of atmosphere.css wraps them in
    // `@media (prefers-reduced-motion: no-preference)`. Source-text
    // assertion (jsdom can't evaluate the media query, same as the
    // mobile test above) — catches regressions where a future
    // refactor moves an `animation:` declaration out of the
    // no-preference block and silently ships an a11y regression.
    const css = readFileSync(ATMOSPHERE_CSS_PATH, 'utf8');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*no-preference\)/);
    // Extract the no-preference block contents up to the matching
    // closing brace at column 0, same approach as the mobile test.
    const noPrefBlockMatch = css.match(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{([\s\S]*?)\n\}/
    );
    expect(noPrefBlockMatch).not.toBeNull();
    const block = noPrefBlockMatch![1];
    // All three drift animations must live inside the gated block.
    expect(block).toMatch(/animation:\s*atmosphere-ambient-drift\b/);
    expect(block).toMatch(/animation:\s*atmosphere-glow-drift\b/);
    expect(block).toMatch(/animation:\s*atmosphere-spec-dot\b/);
  });
});
