/**
 * @fileoverview Drift guard for `_curves.ts`. Reads the source-of-truth
 * easing values from `apps/web/src/lib/styles/tokens.css` and asserts
 * every exported JS-side constant matches its CSS counterpart verbatim.
 *
 * Failure mode this prevents: someone tweaks `--ease-out-expo` in
 * `tokens.css` (or vice-versa) and the JS-driven tweens silently keep
 * the old curve, producing the exact visual-drift bug
 * `_curves.ts` exists to eliminate.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EASE_OUT_EXPO } from './_curves';

/**
 * Extracts a `--<name>: <value>;` declaration from a CSS source string.
 * Tolerates arbitrary whitespace around the value and matches the first
 * declaration encountered (tokens.css declares each curve exactly once).
 *
 * @param css - Raw CSS source.
 * @param name - Custom-property name WITHOUT the leading `--`.
 * @returns The trimmed value, or `null` if the declaration is missing.
 */
function readCssVar(css: string, name: string): string | null {
  const pattern = new RegExp(`--${name}\\s*:\\s*([^;]+);`);
  const match = css.match(pattern);
  return match && match[1] ? match[1].trim() : null;
}

describe('_curves.ts', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const tokensPath = resolve(here, '../styles/tokens.css');
  const css = readFileSync(tokensPath, 'utf-8');

  it('EASE_OUT_EXPO matches --ease-out-expo in tokens.css', () => {
    const cssValue = readCssVar(css, 'ease-out-expo');
    expect(cssValue).not.toBeNull();
    expect(EASE_OUT_EXPO).toBe(cssValue);
  });
});
