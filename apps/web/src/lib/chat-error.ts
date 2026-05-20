/**
 * @fileoverview Client-side error routing for the BYO Anthropic key chat
 * flow (spec `docs/specs/2026-05-20-byo-anthropic-key.md` § Error
 * taxonomy, plan `docs/plans/2026-05-20-byo-anthropic-key.md` Task 5
 * § "Client-side error handling").
 *
 * The `@ai-sdk/svelte` `Chat` client only exposes `error: Error | undefined`
 * — the HTTP status code is not directly available on the client without
 * threading a custom `fetch`. Task 3 (ucs-qdp) of the BYO-key plan
 * established the four fixed strings the server returns. This module
 * matches against those strings to decide what the page should do.
 *
 * If Task 3's response strings ever change, this routing table must
 * update in lockstep — the strings are the contract between the server
 * route shape and the page integration.
 */

/**
 * The four buckets a chat error falls into, from the page's POV.
 *
 * - `key-rejected` (401) — Anthropic rejected the key. Reopen the drawer,
 *   null `apiKey`, focus the key input. UX text lives in the drawer.
 * - `key-malformed` (400) — server-side `LoadAPIKeyError`. Same flow as
 *   401: forces re-entry of the key.
 * - `rate-limit` (429) — quota or rate. Surface an inline message above
 *   the composer; do NOT clear the key.
 * - `generic` (502 / unknown) — anything else. Surface a generic inline
 *   message above the composer.
 */
export type ChatErrorKind = 'key-rejected' | 'key-malformed' | 'rate-limit' | 'generic';

/**
 * Classify a chat error message against the four Task 3 contract strings.
 *
 * The match is substring-based because the `@ai-sdk/svelte` client wraps
 * the server's response body inside an `Error.message` that includes
 * prefixes like "Failed to parse..." — anchoring would be brittle.
 *
 * Order of checks matters: the four contract strings are disjoint, but
 * we put 'key-rejected' first because it's the highest-priority remedial
 * action (forces drawer re-entry).
 *
 * @param message - The string from `chat.error?.message`. May be empty
 *   or `undefined`; both map to `'generic'`.
 * @returns The `ChatErrorKind` bucket the page should route to.
 */
export function classifyChatError(message: string | undefined): ChatErrorKind {
  if (!message) return 'generic';
  if (message.includes('API key rejected by provider')) return 'key-rejected';
  if (message.includes('API key missing or malformed')) return 'key-malformed';
  if (message.includes('Provider rate limit or quota exceeded')) return 'rate-limit';
  return 'generic';
}

/**
 * The inline copy surfaced above the composer for the two error kinds
 * that do not reopen the drawer. The drawer-reopen kinds carry their
 * own copy inside the drawer itself; this map is only for the inline
 * surface.
 */
export const INLINE_ERROR_COPY = {
  'rate-limit': 'Provider rate limit or quota exceeded — check your Anthropic spend limits.',
  generic: 'The chat request failed. Try again, or check your key in settings.'
} as const satisfies Record<Extract<ChatErrorKind, 'rate-limit' | 'generic'>, string>;
