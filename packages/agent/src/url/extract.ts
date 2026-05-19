import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

const MIN_VIABLE_EXTRACTION = 200;

export type ExtractResult = { text: string; title: string };
export type ExtractError = { kind: 'EMPTY_EXTRACTION' } | { kind: 'PARSE_FAILED' };

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

  return {
    text,
    title: (article.title ?? '').trim()
  };
}
