#!/usr/bin/env bun
/**
 * @fileoverview One-shot bake for the mobile atmosphere texture
 * (`apps/web/static/atmosphere-ambient-mobile.png`).
 *
 * Background: Safari mobile rasterises `<feTurbulence>` filter regions
 * on the CPU and stalls past ~600px (see `atmosphere.css` mobile-fallback
 * block). Below 768px the ambient layer drops the live filter and slots
 * a baked PNG via `--atmosphere-ambient-mobile-bg`. This script bakes
 * that PNG — a 1920×1080 fractal-noise field with the 8% opacity from
 * the live layer composited onto the off-white base, so the mobile
 * image matches what desktop renders through the filter chain.
 *
 * Why no `sharp` / `canvas` / Playwright: this is one-shot build tooling
 * — a fractal-noise PNG is a few hundred lines of zlib + math. Bringing
 * in a native image dep (or a headless browser) for a single asset
 * inflates `node_modules` and CI time for zero recurring benefit. The
 * PNG itself is committed; the script only runs on re-bakes.
 *
 * Determinism: PRNG is seeded mulberry32 with a fixed seed (matches the
 * `seed="2"` attribute on the SVG `<feTurbulence>`). Re-running this
 * script produces byte-identical output.
 *
 * Usage:
 *   bun scripts/bake-atmosphere-mobile.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 1920;
const HEIGHT = 1080;
const SEED = 2;
const OCTAVES = 2;
const BASE_FREQUENCY = 0.006;
const AMBIENT_OPACITY = 0.08;
const BG_R = 232;
const BG_G = 232;
const BG_B = 230;
const BG_ALPHA = 0.5;

/**
 * Deterministic 32-bit PRNG. Same seed → same stream, on any JS runtime
 * that respects IEEE-754 + uint32 wrap (which is all of them). We use
 * this instead of `crypto.getRandomValues` because the output must be
 * reproducible across machines — see the determinism note above.
 *
 * @param {number} seed - 32-bit unsigned seed.
 * @returns {() => number} Function returning a float in [0, 1).
 */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a `cols x rows` grid of pseudo-random floats in [0, 1).
 *
 * @param {number} cols - Grid width.
 * @param {number} rows - Grid height.
 * @param {() => number} rng - PRNG bound to a fixed seed.
 * @returns {Float64Array} Row-major buffer of length `cols * rows`.
 */
function makeNoiseGrid(cols, rows, rng) {
  const grid = new Float64Array(cols * rows);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = rng();
  }
  return grid;
}

/**
 * Smoothstep — Ken Perlin's improved fade curve. Used to interpolate
 * inside the noise grid cells so we get continuous "noise" rather than
 * pixelated random values.
 *
 * @param {number} t - Input in [0, 1].
 * @returns {number} Eased value.
 */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Bilinear-with-fade sample of a noise grid at fractional grid coords.
 * Wraps with mod so we don't trip OOB at the image edge.
 *
 * @param {Float64Array} grid
 * @param {number} cols
 * @param {number} rows
 * @param {number} gx - Fractional column.
 * @param {number} gy - Fractional row.
 * @returns {number} Value in [0, 1].
 */
function sample(grid, cols, rows, gx, gy) {
  const x0 = Math.floor(gx) % cols;
  const y0 = Math.floor(gy) % rows;
  const x1 = (x0 + 1) % cols;
  const y1 = (y0 + 1) % rows;
  const tx = fade(gx - Math.floor(gx));
  const ty = fade(gy - Math.floor(gy));
  const v00 = grid[y0 * cols + x0];
  const v10 = grid[y0 * cols + x1];
  const v01 = grid[y1 * cols + x0];
  const v11 = grid[y1 * cols + x1];
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

/**
 * Builds the RGBA pixel buffer for the baked atmosphere. Fractal noise
 * (octaves summed at halving amplitude and doubling frequency) mirrors
 * the SVG `<feTurbulence numOctaves="2">` look. The 8% ambient opacity
 * and 50% bone-tinted background are composited into the buffer here
 * (over fully-transparent black), so when CSS `background-image` slots
 * the PNG it just paints — no further opacity math needed.
 *
 * @returns {Buffer} RGBA bytes, length = WIDTH * HEIGHT * 4.
 */
function buildPixels() {
  const rng = mulberry32(SEED);
  const grids = [];
  for (let o = 0; o < OCTAVES; o++) {
    const freq = BASE_FREQUENCY * 2 ** o;
    const cols = Math.max(2, Math.ceil(WIDTH * freq) + 2);
    const rows = Math.max(2, Math.ceil(HEIGHT * freq) + 2);
    grids.push({ grid: makeNoiseGrid(cols, rows, rng), cols, rows, freq });
  }

  const out = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let sum = 0;
      let amplitude = 1;
      let amplitudeSum = 0;
      for (const { grid, cols, rows, freq } of grids) {
        const gx = x * freq;
        const gy = y * freq;
        sum += sample(grid, cols, rows, gx, gy) * amplitude;
        amplitudeSum += amplitude;
        amplitude *= 0.5;
      }
      const n = sum / amplitudeSum;

      const r = Math.round(BG_R * n);
      const g = Math.round(BG_G * n);
      const b = Math.round(BG_B * n);
      const a = Math.round(255 * BG_ALPHA * AMBIENT_OPACITY);

      const idx = (y * WIDTH + x) * 4;
      out[idx + 0] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = a;
    }
  }
  return out;
}

/**
 * CRC-32 (IEEE 802.3 polynomial). Each PNG chunk ends with a CRC over
 * its type + data; we precompute the lookup table once.
 *
 * @returns {(buf: Buffer) => number}
 */
function makeCrc32() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
}
const crc32 = makeCrc32();

/**
 * Builds a PNG chunk: 4-byte length, 4-byte type, payload, 4-byte CRC.
 *
 * @param {string} type - 4-char ASCII chunk identifier.
 * @param {Buffer} data - Chunk payload.
 * @returns {Buffer}
 */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Encodes an RGBA pixel buffer as a PNG byte stream. Filter byte is 0
 * (None) for every scanline — `feTurbulence`-style noise has high
 * entropy, so PNG filters don't reduce size much, and `None` keeps the
 * encoder simple + deterministic. zlib `level: 9` for best compression
 * at one-shot bake time.
 *
 * @param {Buffer} pixels - RGBA pixel buffer.
 * @param {number} width
 * @param {number} height
 * @returns {Buffer} Complete PNG file bytes.
 */
function encodePng(pixels, width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'apps', 'web', 'static', 'atmosphere-ambient-mobile.png');

const pixels = buildPixels();
const png = encodePng(pixels, WIDTH, HEIGHT);
writeFileSync(outPath, png);

console.log(`baked ${outPath} (${png.length} bytes, ${WIDTH}x${HEIGHT})`);
