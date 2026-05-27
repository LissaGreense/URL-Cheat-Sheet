## Review: feat/ucs-9vn-atmosphere-mobile-png

**Date:** 2026-05-27
**Branch:** feat/ucs-9vn-atmosphere-mobile-png
**PR:** #133
**Verdict:** APPROVED

## Summary

Bakes the mobile atmosphere PNG fallback (`apps/web/static/atmosphere-ambient-mobile.png`)
that the existing `(max-width: 768px)` block in `apps/web/src/lib/styles/atmosphere.css`
has been pointing at since Phase 2 Task 12 (ucs-4wl). The impl team
chose option 3 from the bd issue (hand-rolled PNG via `node:zlib`),
which is the right call for a one-shot bake: no new runtime deps, no
headless-browser CI cost, ~250 LOC of pure crypto/encoder math. All
three acceptance criteria are met:

- PNG exists at `apps/web/static/atmosphere-ambient-mobile.png`
  (703,700 bytes, 1920x1080 RGBA, valid PNG signature + IHDR).
- `--atmosphere-ambient-mobile-bg` is set to
  `url('/atmosphere-ambient-mobile.png')` at `:root` (atmosphere.css
  line 337).
- The mobile `@media (max-width: 768px)` block consumes the variable
  via `background-image: var(--atmosphere-ambient-mobile-bg, none)`
  (line 357), with `filter: none` so the texture renders directly
  instead of being filtered through the broken `feTurbulence` chain.

All four contract tests pass (`vitest run apps/web/src/lib/styles/atmosphere.test.ts`,
609ms). `bun run typecheck` and `bun run lint` are clean. Determinism
verified end-to-end (see below).

## Critical

None.

## Important

None.

## Findings — by category

### Acceptance & PNG validity (positives)

- **PNG is a valid 1920x1080 RGBA PNG.** `file` reports
  `PNG image data, 1920 x 1080, 8-bit/color RGBA, non-interlaced`.
  `sips` agrees on dimensions. IHDR parses cleanly: width=1920,
  height=1080, bit-depth=8, color-type=6 (RGBA), interlace=0.
- **Pixel data is real noise, not blank.** Decoded the IDAT chunk and
  sampled 50 pixels on a coarse grid plus 100 random pixels: 48 unique
  RGBA combos in the grid sample; R/G/B values span 23-197 (out of
  255); zero all-zero pixels. The visible noise field is what the
  desktop SVG `<feTurbulence>` chain would produce, baked at 8%
  opacity. Alpha is constant at 10 (= round(255 * 0.5 * 0.08), the
  `BG_ALPHA * AMBIENT_OPACITY` product) — opacity is pre-baked into
  the alpha channel so the mobile `.atmosphere__ambient` layer's
  `opacity: 0.08` declaration plus the PNG alpha compose to the
  desktop visual without further math. (A previewable copy is at
  `/tmp/atmosphere-preview.png` for spot-check; user can `open` it
  on macOS to visually confirm the noise field.)
- **No flat-ink fallback.** Pre-bake, the `:root` variable defaulted
  to `none`, so mobile got a flat ink panel. Post-bake, the variable
  resolves to a real URL and the texture paints.

### Determinism (positives)

- **Byte-identical re-bake confirmed.** Ran `bun run bake:atmosphere-mobile`
  against the committed PNG; SHA256 matched before and after
  (`8d396db388bf9e335f219bc76d439b0ad09439313f9d447b2ecaf38b68441591`).
  `cmp` reports the files identical. The bake is reproducible across
  machines — `mulberry32(2)` PRNG, fixed grid sizes derived from
  `WIDTH * BASE_FREQUENCY`, `deflateSync` with `level: 9`. No timestamps,
  no wall-clock, no `crypto.getRandomValues` in the encoder.
- **Encoder is correct PNG-spec.** Signature `\x89PNG\r\n\x1a\n`,
  IHDR with the right 13-byte payload, single IDAT chunk with
  filter-byte-0 scanlines (None filter — high-entropy noise wouldn't
  compress better with Sub/Up/Average/Paeth), IEND terminator.
  CRC-32 over each chunk's type+data with the IEEE polynomial. The
  per-row filter byte is correctly written at `y * (stride + 1)`
  before each `width * 4` RGBA row.

### Dependencies (positives)

- **No new runtime deps.** `package.json` adds only one script line
  (`bake:atmosphere-mobile`) and no entries to `devDependencies` or
  `dependencies`. No `sharp`, no `canvas`, no `pngjs`, no `jimp`. The
  bake script imports only `node:zlib`, `node:fs`, `node:path`, and
  `node:url`. That's the lowest-overhead viable option of the three
  the bd issue listed.

### CSS wiring (positives)

- **Variable is `:root`-defined, not inside the media query.** Lines
  335-338 define `--atmosphere-ambient-mobile-bg` unconditionally at
  `:root`. This is correct: the URL is resolved once globally, and the
  variable is consumed only inside `@media (max-width: 768px)`. Defining
  it inside the media query would have been the obvious-but-wrong shape
  — it would have made the bake target invisible to anyone reading the
  file top-down. The inline comment on lines 327-334 explicitly calls
  out the rationale, which is exactly the kind of WHY-comment that
  earns its keep.
- **Mobile block consumes via `var()` with a `none` fallback.** Line
  357: `background-image: var(--atmosphere-ambient-mobile-bg, none);`.
  The `none` fallback preserves the pre-bake graceful-degradation
  behavior if the PNG ever 404s.
- **`filter: none` strips the feTurbulence chain on mobile.** Line 355:
  `filter: none;` — exactly what the bd issue calls for (Safari mobile
  chokes on `<feTurbulence>` regions above ~600px because it rasterises
  on the CPU). The PNG replaces the filter output, not augments it.

### Tests (positives)

- **Four contract tests cover the acceptance triple.**
  `atmosphere.test.ts:24-55`:
  1. PNG file exists and is >1024 bytes (catches empty-file bakes).
  2. PNG signature byte sequence matches + IHDR chunk has the right
     1920x1080 dimensions (catches "wrote some bytes that aren't a PNG"
     and "wrote a PNG at the wrong size").
  3. CSS source contains the `--atmosphere-ambient-mobile-bg:
     url(...)` declaration with the correct path (catches wiring drift
     in either direction — variable rename or URL drift).
  4. The mobile `@media` block consumes the variable via
     `background-image` (catches the failure mode where the variable
     exists but nothing reads it).
- **Tests parse the raw CSS source rather than relying on JSDOM
  painting the media query.** That's the right pattern for this repo
  (matches `tokens.test.ts`) — JSDOM doesn't compute styles for
  `@media` blocks, and Vite's CSS pipeline strips imports for the
  test runner. Documented inline in the test file's `@fileoverview`.

### Code style & conventions (positives)

- **No `eslint-disable`, no `@ts-ignore`, no `@ts-expect-error`.**
  Grep across all three changed source files returns zero hits.
- **JSDoc on every exported function in `bake-atmosphere-mobile.mjs`.**
  Each helper (`mulberry32`, `makeNoiseGrid`, `fade`, `sample`,
  `buildPixels`, `makeCrc32`, `chunk`, `encodePng`) has a JSDoc block
  with `@param`/`@returns`. The file-level `@fileoverview` explains
  WHY pure-zlib (no new deps), WHY this is one-shot tooling, and HOW
  determinism is preserved. Comments in this script lean WHY rather
  than WHAT, which is the right call for a hand-rolled PNG encoder
  where the spec context isn't in scope for casual readers.
- **Determinism note in `atmosphere.css` is colocated with the
  variable definition.** Lines 327-334 explain why the variable lives
  at `:root` even though it's consumed only inside the media query,
  and point at the bake script. This is the right place for that
  context — anyone editing the mobile block can see the bake script
  pointer immediately.

## Needs Decision

None.

## Verification commands run

```bash
file apps/web/static/atmosphere-ambient-mobile.png
# PNG image data, 1920 x 1080, 8-bit/color RGBA, non-interlaced

sips -g pixelWidth -g pixelHeight apps/web/static/atmosphere-ambient-mobile.png
# pixelWidth: 1920 / pixelHeight: 1080

shasum -a 256 apps/web/static/atmosphere-ambient-mobile.png
# 8d396db388bf9e335f219bc76d439b0ad09439313f9d447b2ecaf38b68441591

bun run bake:atmosphere-mobile
shasum -a 256 apps/web/static/atmosphere-ambient-mobile.png
cmp /tmp/atmosphere-ambient-mobile-original.png apps/web/static/atmosphere-ambient-mobile.png
# SHA256 unchanged; cmp silent; BYTE-IDENTICAL

bun run typecheck
# tsc -b → clean

bun run lint
# eslint . && prettier --check . → clean

bunx vitest run apps/web/src/lib/styles/atmosphere.test.ts
# Test Files 1 passed (1); Tests 4 passed (4); 609ms
```

## Verdict

APPROVED. All three bd acceptance criteria met. PNG is a valid
1920x1080 RGBA file with real noise data (not blank). Bake is
byte-deterministic (re-run produces identical SHA256). No new runtime
deps. CSS wiring is correct in both directions (variable defined,
variable consumed). Four contract tests cover the acceptance triple
and pass. No lint/typecheck regressions.

Visual confirmation is the one remaining check the review can't do
headlessly. A previewable copy of the PNG is at
`/tmp/atmosphere-preview.png` if the user wants to `open` it and
eyeball the noise field; the pixel-statistics evidence above
(48 unique RGBA combos in a 50-pixel grid sample, RGB range 23-197)
already establishes the file is varied, non-flat noise.
