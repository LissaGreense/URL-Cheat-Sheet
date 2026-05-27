import { readFileSync } from 'node:fs';

/**
 * Parses a dotenv-style file into a plain `Record<string, string>`.
 *
 * Supports the subset we need for the evals harness:
 *  - `KEY=VALUE` pairs
 *  - blank lines and `#`-prefixed comments
 *  - optional `export ` prefix on lines
 *  - single- or double-quoted values (quotes stripped)
 *
 * Returns `{}` when the file is missing — callers merge this onto
 * `process.env`, and a missing repo-root `.env` is a normal state on
 * CI / when the user exports the key in their parent shell.
 *
 * We avoid pulling in `dotenv` as a runtime dep because the parsing
 * surface we exercise is tiny and the file shape we read is fully
 * under the user's control.
 *
 * @param path Absolute path to the env file.
 * @returns Parsed key/value pairs. Empty when the file does not exist.
 */
export function loadDotenv(path: string): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (err) {
    if (isFileNotFound(err)) return {};
    throw err;
  }

  const result: Record<string, string> = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice('export '.length) : line;
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (key === '') continue;

    const value = stripQuotes(withoutExport.slice(eq + 1).trim());
    result[key] = value;
  }
  return result;
}

/**
 * Strips a single matching pair of surrounding `"` or `'` quotes.
 * Leaves unmatched or unquoted values unchanged.
 */
function stripQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function isFileNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'ENOENT'
  );
}
