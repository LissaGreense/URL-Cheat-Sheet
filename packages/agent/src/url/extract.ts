import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { Heading } from '@url-cheat-sheet/schemas';

const MIN_VIABLE_EXTRACTION = 200;
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

export type ExtractResult = { text: string; title: string; headings: Heading[] };
export type ExtractError = { kind: 'EMPTY_EXTRACTION' } | { kind: 'PARSE_FAILED' };

/**
 * Collapse runs of whitespace to a single space, trim, and lowercase.
 * Used for normalized comparison between heading element text (which may
 * contain internal newlines or non-breaking spaces) and body lines.
 */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Re-parse the HTML article body produced by Readability and resolve each
 * heading element (h1–h6) to its line number in `textContent`.
 *
 * Algorithm (deliberately conservative — never mutates `textContent`):
 *   1. Iterate `h1..h6` elements in document order.
 *   2. Normalize the heading's `textContent`. Skip empty headings.
 *   3. Walk `textContent.split('\n')` from a running cursor (starts at 0).
 *      For each heading, find the first body-line index `i >= cursor`
 *      whose normalized form *includes* the normalized heading text.
 *      Record `{ text: <original>, level, line: i + 1 }` and advance the
 *      cursor to `i + 1`. Skip headings that can't be located.
 *
 * The cursor invariant guarantees that headings are assigned to lines in
 * document order — a later heading whose text also appears earlier in the
 * body cannot be mis-attributed to that earlier line, because a prior
 * heading has already consumed it (or the cursor has otherwise moved
 * past it).
 *
 * @param contentHtml HTML string from `Readability.parse().content`.
 * @param textContent Plain-text article body (Readability `textContent`).
 * @returns Heading[] — empty when `contentHtml` has no headings.
 */
export function extractHeadings(contentHtml: string, textContent: string): Heading[] {
  let doc: Document;
  try {
    ({ document: doc } = parseHTML(contentHtml) as unknown as { document: Document });
  } catch {
    return [];
  }

  const elements = Array.from(doc.querySelectorAll(HEADING_SELECTOR));
  if (elements.length === 0) return [];

  const lines = textContent.split('\n');
  const normLines = lines.map(normalize);

  const headings: Heading[] = [];
  let cursor = 0;

  for (const el of elements) {
    const original = (el.textContent ?? '').trim();
    const norm = normalize(original);
    if (!norm) continue;

    // Skip headings that produced an empty original after trimming (text
    // would fail `z.string().min(1)`).
    if (!original) continue;

    let foundAt = -1;
    for (let i = cursor; i < normLines.length; i++) {
      if (normLines[i]!.includes(norm)) {
        foundAt = i;
        break;
      }
    }
    if (foundAt === -1) continue;

    const tag = el.tagName.toLowerCase();
    const level = Number(tag.slice(1)) as Heading['level'];
    headings.push({ text: original, level, line: foundAt + 1 });
    cursor = foundAt + 1;
  }

  return headings;
}

/**
 * Parse HTML, run Readability, return clean main-content text and the page
 * title. Returns ExtractError if Readability can't produce a meaningful
 * extract (SPA shells, malformed documents).
 *
 * The returned `headings` array is a sidecar resolved from
 * `article.content` (HTML) — `text` derivation is byte-identical to the
 * pre-sidecar implementation. Existing Lxx citations remain stable.
 */
export function extractContent(html: string, sourceUrl: string): ExtractResult | ExtractError {
  let document: Document;
  try {
    ({ document } = parseHTML(html) as unknown as { document: Document });
  } catch {
    return { kind: 'PARSE_FAILED' };
  }

  // Inject <base href> so Readability resolves relative URLs against the
  // source URL.
  let head = document.querySelector('head');
  if (!head) {
    head = document.createElement('head');
    document.documentElement.prepend(head);
  }
  const base = document.createElement('base');
  base.setAttribute('href', sourceUrl);
  head.prepend(base);

  // linkedom's Document exposes the surface Readability needs; cast across
  // the type boundary.
  const article = new Readability(document as unknown as Document).parse();
  // Readability returns null when the document has no extractable main
  // content (e.g. SPA shells). Treat that as EMPTY_EXTRACTION rather than
  // PARSE_FAILED — the HTML parsed fine, there just isn't an article.
  if (!article || !article.textContent) {
    return { kind: 'EMPTY_EXTRACTION' };
  }

  const text = article.textContent.trim();
  if (text.length < MIN_VIABLE_EXTRACTION) {
    return { kind: 'EMPTY_EXTRACTION' };
  }

  const headings = extractHeadings(article.content ?? '', text);

  return {
    text,
    title: (article.title ?? '').trim(),
    headings
  };
}
