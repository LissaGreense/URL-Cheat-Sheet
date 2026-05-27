import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDotenv } from '../src/load-env.ts';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ucs-evals-load-env-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeEnv(contents: string): string {
  const path = join(tmpDir, '.env');
  writeFileSync(path, contents, 'utf8');
  return path;
}

describe('loadDotenv', () => {
  it('parses KEY=VALUE pairs into a string-keyed record', () => {
    const path = writeEnv('FOO=bar\nBAZ=qux\n');
    expect(loadDotenv(path)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('skips blank lines and # comments', () => {
    const path = writeEnv('# a comment\n\nFOO=bar\n   # indented comment\nBAZ=qux\n');
    expect(loadDotenv(path)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('trims surrounding whitespace from keys and values', () => {
    const path = writeEnv('  FOO = bar  \n');
    expect(loadDotenv(path)).toEqual({ FOO: 'bar' });
  });

  it('strips matching single or double quotes around values', () => {
    const path = writeEnv('FOO="bar baz"\nQUX=\'spam ham\'\n');
    expect(loadDotenv(path)).toEqual({ FOO: 'bar baz', QUX: 'spam ham' });
  });

  it('tolerates a leading `export ` prefix on lines', () => {
    const path = writeEnv('export FOO=bar\n');
    expect(loadDotenv(path)).toEqual({ FOO: 'bar' });
  });

  it('returns an empty record when the file does not exist', () => {
    expect(loadDotenv(join(tmpDir, 'nope.env'))).toEqual({});
  });

  it('ignores lines with no `=` separator', () => {
    const path = writeEnv('FOO=bar\nnot a real line\nBAZ=qux\n');
    expect(loadDotenv(path)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('keeps later occurrences of a duplicated key (last-write-wins)', () => {
    const path = writeEnv('FOO=first\nFOO=second\n');
    expect(loadDotenv(path)).toEqual({ FOO: 'second' });
  });
});
