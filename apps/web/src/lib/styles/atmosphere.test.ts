/**
 * @fileoverview Contract tests for the atmosphere mobile-fallback wiring
 * (ucs-9vn). Verifies the baked PNG exists at the expected static path,
 * is a valid 1920×1080 PNG, and is referenced by the
 * `--atmosphere-ambient-mobile-bg` CSS variable in `atmosphere.css`.
 *
 * Mirrors the file-read approach in `tokens.test.ts`: JSDOM never
 * actually paints the mobile media query, and Vite's CSS pipeline
 * strips imports for the test runner, so we read the raw CSS and
 * assert on its source text.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(here, './atmosphere.css');
const pngPath = resolve(here, '../../../static/atmosphere-ambient-mobile.png');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe('atmosphere mobile fallback (ucs-9vn)', () => {
  it('ships a baked PNG at apps/web/static/atmosphere-ambient-mobile.png', () => {
    const stat = statSync(pngPath);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(1024);
  });

  it('writes a valid PNG (signature + IHDR dimensions)', () => {
    const buf = readFileSync(pngPath);
    expect(buf.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    const ihdrType = buf.subarray(12, 16).toString('ascii');
    expect(ihdrType).toBe('IHDR');
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    expect(width).toBe(1920);
    expect(height).toBe(1080);
  });

  it('wires --atmosphere-ambient-mobile-bg to /atmosphere-ambient-mobile.png', () => {
    const css = readFileSync(cssPath, 'utf-8');
    expect(css).toMatch(
      /--atmosphere-ambient-mobile-bg:\s*url\(['"]\/atmosphere-ambient-mobile\.png['"]\)/
    );
  });

  it('keeps the mobile media query consuming the variable', () => {
    const css = readFileSync(cssPath, 'utf-8');
    const mobileBlock = css.match(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{[\s\S]*?\n\}/);
    expect(mobileBlock).not.toBeNull();
    expect(mobileBlock![0]).toMatch(/background-image:\s*var\(--atmosphere-ambient-mobile-bg/);
  });
});
