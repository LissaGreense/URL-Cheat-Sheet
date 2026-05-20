/**
 * @fileoverview Contract tests for tokens.css — verify the design tokens
 * required by spec §2.1, §2.2, §3.1, §3.2 are present and resolve to the
 * spec-defined values when the stylesheet is applied.
 *
 * Vite's import pipeline strips CSS for jsdom — `import './tokens.css'`
 * resolves but the styles never reach the document. To validate the
 * *contract* (token name + value), we read the raw file with Vite's
 * `?raw` query and inject it into the document so JSDOM's
 * `getComputedStyle` reflects the real values. This keeps the test
 * coupled to the file's actual content, not a parallel constant.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads a CSS custom property from `:root` and trims whitespace.
 * @param {string} name - The custom property name, including leading `--`.
 * @returns {string} The resolved value, with surrounding whitespace stripped.
 */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

describe('tokens.css', () => {
  beforeAll(() => {
    // Vite's CSS pipeline strips `import './tokens.css'` for jsdom, and
    // the `?raw` query also returns empty under SvelteKit's plugin chain.
    // Read the file directly off disk so JSDOM sees the real text.
    // Resolve relative to *this file* (via `import.meta.url`) — not
    // `process.cwd()`, which is `apps/web/` when run via the workspace
    // filter but the repo root when CI runs `bun run test`.
    const here = dirname(fileURLToPath(import.meta.url));
    const cssPath = resolve(here, './tokens.css');
    const css = readFileSync(cssPath, 'utf-8');
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  });

  describe('palette (spec §2.1)', () => {
    it('defines the ink scale', () => {
      expect(token('--ink-void')).toBe('#0a0a0b');
      expect(token('--ink-base')).toBe('#131312');
      expect(token('--ink-mid')).toBe('#1c1e22');
      expect(token('--ink-rise')).toBe('#262c28');
    });

    it('defines bone (foreground text)', () => {
      expect(token('--bone')).toBe('#e8e8e6');
      expect(token('--bone-dim')).toBe('rgba(232, 232, 230, 0.55)');
      expect(token('--hair')).toBe('rgba(232, 232, 230, 0.12)');
    });

    it('defines the green accent pair', () => {
      expect(token('--green-acid')).toBe('#bee26e');
      expect(token('--green-deep')).toBe('#33524d');
    });

    it('defines secondary tints', () => {
      expect(token('--teal-glacial')).toBe('rgba(91, 219, 198, 0.65)');
      expect(token('--seafoam-soft')).toBe('rgba(180, 255, 222, 0.5)');
    });

    it('defines the rationed amber-alarm', () => {
      expect(token('--amber-alarm')).toBe('#d4a017');
    });
  });

  describe('typography (spec §2.2)', () => {
    it('defines display and body font stacks', () => {
      const display = token('--font-display');
      const body = token('--font-body');
      expect(display).toContain('Protrakt');
      expect(display).toContain('Space Grotesk');
      expect(body).toContain('Manrope');
    });
  });

  describe('easing (spec §3.1)', () => {
    it('defines the three sanctioned curves', () => {
      expect(token('--ease-out-expo')).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
      expect(token('--ease-out-soft')).toBe('cubic-bezier(0.33, 1, 0.68, 1)');
      expect(token('--ease-linear')).toBe('linear');
    });
  });

  describe('duration (spec §3.2)', () => {
    it('defines the motion duration scale', () => {
      expect(token('--dur-tick')).toBe('120ms');
      expect(token('--dur-quick')).toBe('200ms');
      expect(token('--dur-enter')).toBe('500ms');
      expect(token('--dur-reveal')).toBe('800ms');
      expect(token('--dur-cinema')).toBe('1600ms');
      expect(token('--dur-ambient')).toBe('8000ms');
    });
  });
});
