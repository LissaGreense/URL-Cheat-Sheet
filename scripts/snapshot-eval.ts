#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';

/**
 * Repo-root shim: forwards to packages/evals/src/run.ts so contributors
 * can run `bun scripts/snapshot-eval.ts <suite>` from anywhere.
 */
const suite = process.argv[2];
if (!suite) {
  console.error('Usage: bun scripts/snapshot-eval.ts <suite>');
  process.exit(2);
}
const r = spawnSync('bun', ['packages/evals/src/run.ts', suite], { stdio: 'inherit' });
process.exit(r.status ?? 1);
