#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '..', '..');

/**
 * Runs a promptfoo suite and writes a snapshot to docs/evals/<suite>-<date>.md.
 *
 * Usage: bun packages/evals/src/run.ts <suite-name>
 */
const suite = process.argv[2];
if (!suite) {
  console.error('Usage: bun src/run.ts <suite-name>');
  process.exit(2);
}

const cfg = join(packageRoot, 'suites', suite, 'promptfooconfig.yaml');
const outputPath = join(tmpdir(), `promptfoo-${suite}-${Date.now()}.json`);

// Run from packageRoot so bunx resolves the locally-installed promptfoo
// (and the workspace symlinks the provider needs) instead of downloading
// a stand-alone copy that can't see `@url-cheat-sheet/*`.
const result = spawnSync(
  'bunx',
  ['promptfoo', 'eval', '-c', cfg, '--no-cache', '--output', outputPath],
  { encoding: 'utf8', cwd: packageRoot }
);

// promptfoo exit codes: 0 = all pass, 100 = some tests failed (run completed).
// Both produce a valid output file we want to snapshot. Anything else (1, 2, …)
// is a real harness error — bubble it up without writing a misleading snapshot.
const RUN_COMPLETED_CODES = new Set([0, 100]);
if (!RUN_COMPLETED_CODES.has(result.status ?? -1)) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

let evalJson = '{}';
try {
  evalJson = readFileSync(outputPath, 'utf8').trim() || '{}';
} finally {
  rmSync(outputPath, { force: true });
}

const today = new Date().toISOString().slice(0, 10);
const outDir = join(repoRoot, 'docs/evals');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${suite}-${today}.md`);

const snapshot = [`# Eval snapshot: ${suite} — ${today}`, '', '```json', evalJson, '```'].join(
  '\n'
);

writeFileSync(outFile, snapshot, 'utf8');
console.log(`Snapshot written to ${outFile}`);
