import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { Heading } from '@url-cheat-sheet/schemas';

const MIN_VIABLE_EXTRACTION = 200;
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

export type ExtractResult = { text: string; title: string; headings: Heading[] };
export type ExtractError = { kind: 'EMPTY_EXTRACTION' } | { kind: 'PARSE_FAILED' };

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Resolve each h1-h6 in `contentHtml` to its line number in `textContent`.
 *
 * The cursor invariant matters: each heading consumes a line, then the
 * search resumes past it. Without this, a later heading whose text also
 * appears earlier in the body would be mis-attributed to that earlier
 * line. Never mutates `textContent`.
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
 */
export function extractContent(html: string, sourceUrl: string): ExtractResult | ExtractError {
  let document: Document;
  try {
    ({ document } = parseHTML(html) as unknown as { document: Document });
  } catch {
    return { kind: 'PARSE_FAILED' };
  }

  // <base href> so Readability resolves relative URLs against the source.
  let head = document.querySelector('head');
  if (!head) {
    head = document.createElement('head');
    document.documentElement.prepend(head);
  }
  const base = document.createElement('base');
  base.setAttribute('href', sourceUrl);
  head.prepend(base);

  // linkedom's Document exposes the surface Readability needs; cast across.
  const article = new Readability(document as unknown as Document).parse();
  // Null = no extractable main content (SPA shells); HTML parsed fine so
  // EMPTY_EXTRACTION, not PARSE_FAILED.
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
