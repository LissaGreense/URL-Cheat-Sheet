#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

const cfg = join('packages/evals/suites', suite, 'promptfooconfig.yaml');
const result = spawnSync(
  'bunx',
  ['promptfoo', 'eval', '-c', cfg, '--no-cache', '--output', 'json'],
  {
    encoding: 'utf8'
  }
);

if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

const today = new Date().toISOString().slice(0, 10);
const outDir = 'docs/evals';
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${suite}-${today}.md`);

const snapshot = [
  `# Eval snapshot: ${suite} — ${today}`,
  '',
  '```json',
  result.stdout.trim() || '{}',
  '```'
].join('\n');

writeFileSync(outFile, snapshot, 'utf8');
console.log(`Snapshot written to ${outFile}`);
