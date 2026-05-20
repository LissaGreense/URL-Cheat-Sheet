/**
 * Calibrate the grounding judge against a hand-labeled gold set.
 *
 * Reads `packages/evals/judges/grounding-gold.jsonl`, calls
 * {@link gradeGrounding} on every row using the row's embedded
 * `document.text` (NEVER re-fetches URLs — calibration must be
 * reproducible against frozen source text), builds a TP/TN/FP/FN
 * confusion matrix, computes Cohen's κ inline, and writes a Markdown
 * snapshot to `docs/evals/grounding-judge-calibration-<YYYY-MM-DD>.md`.
 *
 * Exit codes:
 * - 0 if κ ≥ 0.6 (judge is acceptably aligned with human labels)
 * - 1 if κ < 0.6 (escalate per spec — either refine the gold set or
 *   move to a stronger judge model)
 * - 2 if the gold file is missing, unreadable, or any row fails to parse
 *
 * Intended invocation: `bun packages/evals/src/calibrate-judge.ts`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeGrounding, JUDGE_DEFAULT_MODEL, type Verdict } from './judges/grounding-judge-core';

interface GoldRow {
  description: string;
  question: string;
  output: string;
  document: { text: string; title: string; sourceUrl: string };
  humanVerdict: 'pass' | 'fail';
  humanReason: string;
}

interface ScoredRow {
  index: number;
  description: string;
  humanPass: boolean;
  verdict: Verdict;
}

interface ConfusionMatrix {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  n: number;
}

interface KappaResult {
  kappa: number;
  po: number;
  pe: number;
  degenerate: boolean;
  degenerateNote: string | null;
}

const KAPPA_PASS_THRESHOLD = 0.6;

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLD_PATH = resolve(HERE, '../judges/grounding-gold.jsonl');
const SNAPSHOT_DIR = resolve(HERE, '../../../docs/evals');

async function loadGold(): Promise<GoldRow[]> {
  let raw: string;
  try {
    raw = await readFile(GOLD_PATH, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read gold file at ${GOLD_PATH}: ${(err as Error).message}`);
  }

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error(`Gold file at ${GOLD_PATH} is empty`);
  }

  return lines.map((line, i) => parseRow(line, i));
}

function parseRow(line: string, index: number): GoldRow {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch (err) {
    throw new Error(`Row ${index + 1}: JSON.parse failed — ${(err as Error).message}`);
  }

  if (typeof obj !== 'object' || obj === null) {
    throw new Error(`Row ${index + 1}: expected JSON object, got ${typeof obj}`);
  }

  const rec = obj as Record<string, unknown>;
  const description = rec['description'];
  const question = rec['question'];
  const output = rec['output'];
  const document = rec['document'];
  const humanVerdict = rec['humanVerdict'];
  const humanReason = rec['humanReason'];

  if (
    typeof description !== 'string' ||
    typeof question !== 'string' ||
    typeof output !== 'string' ||
    typeof humanReason !== 'string'
  ) {
    throw new Error(`Row ${index + 1}: missing or non-string text fields`);
  }
  if (humanVerdict !== 'pass' && humanVerdict !== 'fail') {
    throw new Error(
      `Row ${index + 1}: humanVerdict must be "pass" or "fail", got ${JSON.stringify(humanVerdict)}`
    );
  }
  if (typeof document !== 'object' || document === null) {
    throw new Error(`Row ${index + 1}: document must be an object`);
  }
  const doc = document as Record<string, unknown>;
  if (
    typeof doc['text'] !== 'string' ||
    typeof doc['title'] !== 'string' ||
    typeof doc['sourceUrl'] !== 'string'
  ) {
    throw new Error(`Row ${index + 1}: document.{text,title,sourceUrl} must all be strings`);
  }

  return {
    description,
    question,
    output,
    document: {
      text: doc['text'],
      title: doc['title'],
      sourceUrl: doc['sourceUrl']
    },
    humanVerdict,
    humanReason
  };
}

function buildConfusion(rows: ScoredRow[]): ConfusionMatrix {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (const r of rows) {
    const j = r.verdict.pass;
    const h = r.humanPass;
    if (j && h) tp++;
    else if (!j && !h) tn++;
    else if (j && !h) fp++;
    else fn++;
  }
  return { tp, tn, fp, fn, n: rows.length };
}

/**
 * Cohen's κ with a degenerate-case guard.
 *
 * `pe` (chance agreement) approaches 1 when both raters concentrate on
 * a single class — e.g. judge and human both say "pass" on every row.
 * The standard formula's denominator (`1 - pe`) then goes to 0 and κ is
 * undefined. We catch that with a `pe >= 1 - 1e-9` epsilon check:
 *
 * - If `po === 1`, observed agreement is perfect, so we report κ = 1.0
 *   (true but uninformative — note this in the snapshot).
 * - Otherwise we report κ = 0.0 — the judge fully disagreed with a
 *   single-class set, which is a real failure, not a "no signal" case.
 *
 * On a healthy 5-good + 5-bad gold set this branch should never fire.
 */
function computeKappa(m: ConfusionMatrix): KappaResult {
  const { tp, tn, fp, fn, n } = m;
  const po = (tp + tn) / n;
  const pe = ((tp + fn) * (tp + fp) + (tn + fp) * (tn + fn)) / (n * n);

  if (pe >= 1 - 1e-9) {
    if (po === 1) {
      return {
        kappa: 1.0,
        po,
        pe,
        degenerate: true,
        degenerateNote:
          'pe ≈ 1 (both raters concentrated on a single class) AND po = 1 — κ undefined, reporting 1.0 (perfect agreement, but κ has no discriminatory signal here).'
      };
    }
    return {
      kappa: 0.0,
      po,
      pe,
      degenerate: true,
      degenerateNote:
        'pe ≈ 1 (both raters concentrated on a single class) AND po < 1 — κ undefined, reporting 0.0 (judge disagreed with a single-class gold set; treat as failure).'
    };
  }

  return {
    kappa: (po - pe) / (1 - pe),
    po,
    pe,
    degenerate: false,
    degenerateNote: null
  };
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function renderSnapshot(opts: {
  date: string;
  judgeModel: string;
  scored: ScoredRow[];
  matrix: ConfusionMatrix;
  kappaResult: KappaResult;
  passed: boolean;
}): string {
  const { date, judgeModel, scored, matrix, kappaResult, passed } = opts;
  const { tp, tn, fp, fn, n } = matrix;

  const perRow = scored
    .map((r) => {
      const judgePassLabel = r.verdict.pass ? 'true' : 'false';
      const humanPassLabel = r.humanPass ? 'true' : 'false';
      const agree = r.verdict.pass === r.humanPass ? 'agree' : 'MISMATCH';
      const score = r.verdict.score.toFixed(3);
      const reason = r.verdict.reason.replace(/"/g, '\\"');
      return `- [${r.index + 1}] ${r.description} — judge pass=${judgePassLabel} (score ${score}) vs human pass=${humanPassLabel} — ${agree} — judge reason: "${reason}"`;
    })
    .join('\n');

  const degenerateLine = kappaResult.degenerate
    ? `\n> Degenerate-case guard fired: ${kappaResult.degenerateNote}\n`
    : '';

  const verdictLine = passed
    ? `**PASS: κ >= ${KAPPA_PASS_THRESHOLD}**`
    : `**ESCALATE: κ < ${KAPPA_PASS_THRESHOLD}**`;

  return `# Grounding judge calibration — ${date}

- Judge model: \`${judgeModel}\`
- Gold rows: ${n}
- κ pass threshold: ${KAPPA_PASS_THRESHOLD}

## Confusion matrix

| | human pass | human fail |
|---|---|---|
| **judge pass** | TP=${tp} | FP=${fp} |
| **judge fail** | FN=${fn} | TN=${tn} |

## Agreement

- po (observed) = ${kappaResult.po.toFixed(4)}
- pe (chance) = ${kappaResult.pe.toFixed(4)}
- **Cohen's κ = ${kappaResult.kappa.toFixed(4)}**
${degenerateLine}
## Per-row results

${perRow}

${verdictLine}
`;
}

function renderStdoutSummary(opts: {
  date: string;
  judgeModel: string;
  scored: ScoredRow[];
  matrix: ConfusionMatrix;
  kappaResult: KappaResult;
  passed: boolean;
}): string {
  return renderSnapshot(opts);
}

async function main(): Promise<number> {
  let rows: GoldRow[];
  try {
    rows = await loadGold();
  } catch (err) {
    console.error(`[calibrate-judge] ${(err as Error).message}`);
    return 2;
  }

  const scored: ScoredRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const verdict = await gradeGrounding({
      question: row.question,
      output: row.output,
      document: row.document
    });
    scored.push({
      index: i,
      description: row.description,
      humanPass: row.humanVerdict === 'pass',
      verdict
    });
  }

  const matrix = buildConfusion(scored);
  const kappaResult = computeKappa(matrix);
  const passed = kappaResult.kappa >= KAPPA_PASS_THRESHOLD;

  const date = todayISODate();
  const judgeModel = JUDGE_DEFAULT_MODEL;
  const snapshot = renderSnapshot({
    date,
    judgeModel,
    scored,
    matrix,
    kappaResult,
    passed
  });

  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const snapshotPath = resolve(SNAPSHOT_DIR, `grounding-judge-calibration-${date}.md`);
  await writeFile(snapshotPath, snapshot, 'utf8');

  console.log(renderStdoutSummary({ date, judgeModel, scored, matrix, kappaResult, passed }));
  console.log(`\nSnapshot written to ${snapshotPath}`);

  return passed ? 0 : 1;
}

const exitCode = await main();
process.exit(exitCode);
