## Review: feat/ucs-14v-payload-size-guard

**Date:** 2026-05-27
**Branch:** feat/ucs-14v-payload-size-guard
**PR:** #132
**Verdict:** APPROVED

## Summary

Adds a `MAX_CHAT_PAYLOAD_BYTES = 1024 * 1024` ceiling and an early
`content-length`-based 413 in `apps/web/src/routes/api/chat/+server.ts`,
plus two deterministic vitest cases covering both branches. All four
acceptance criteria are met:

- POST /api/chat with body >1 MiB returns 413 with
  `{ error: 'payload_too_large', limit: 1048576 }`.
- Body <=1 MiB passes through unchanged (the existing schema-parse path
  is preserved verbatim).
- Limit constant defined once at module scope; not magic-numbered.
- Unit test covers both branches (`413s when content-length exceeds`
  and `passes through when payload is at or under`).

The guard sits *before* `request.json()`, before `chatRequestSchema.safeParse`,
and before `streamChat` — which is the whole point of the cheap-reject
pattern. 14/14 tests in `apps/web/tests/chat-route.test.ts` pass.
`bun run check` is clean (0 errors, 0 warnings, 723 files).

## Critical

None.

## Important

None — see "Needs Decision" for the one substantive finding (the
no-`content-length` fallthrough), which I'm filing as follow-up rather
than blocking.

## Findings — by category

### Acceptance & placement (positives)

- **Guard placement is correct.** Lines 48-61 of `+server.ts`: the
  `content-length` check is the first thing the handler does, before
  `await request.json()`, before `chatRequestSchema.safeParse`, before
  the `streamChat` call. Hostile clients that advertise a multi-MB
  body never get to buffer it, never get to spend the user's Anthropic
  quota. That's exactly the threat model in the bd issue ("a hostile
  or buggy client cannot spend the user's Anthropic quota in one
  massive call").
- **Constant is module-scoped.** `MAX_CHAT_PAYLOAD_BYTES = 1024 * 1024`
  on line 14, referenced twice (the comparison on line 58 and the
  `limit` field in the 413 body on line 59). No magic-number drift
  possible between the threshold and the reported limit.
- **413 + RFC-correct error payload.** Status 413 matches RFC 9110
  §15.5.14 "Content Too Large". The body shape
  `{ error: 'payload_too_large', limit }` is consistent with the
  rest of the file's error shapes (compare lines 67, 72, 88, 91, 93,
  96 — all `{ error: '<human-readable string>' }`; this one adds a
  `limit` field, which is a useful client-side hint and doesn't break
  the shape).

### Correctness (positives)

- **`Number(...)` + `Number.isFinite` is the right parse.**
  `Number("abc")` is `NaN`, `Number.isFinite(NaN)` is false, so
  unparseable headers fall through (not reject). `Number("")` is `0`,
  `Number.isFinite(0)` is true, `0 > 1048576` is false — empty-string
  header also falls through. No `parseInt` "radix accidentally octal"
  surprises. No silent NaN-truthy bug.
- **Header presence check is explicit.** `contentLengthHeader !== null`
  (line 56) — Web Request `headers.get()` returns `string | null`, not
  `undefined`, so the strict `!== null` matches the type. No
  truthiness-confusion with `'0'` as a header value (which would be
  falsy in `if (contentLengthHeader)` but is a legitimate header that
  should pass the guard).
- **No header set === fall through.** A client that omits
  `content-length` entirely hits the `null` branch and proceeds to
  schema parse. That's the documented decision, and within the
  acceptance criteria (which specify only the header-based path).
- **No mutation of `request`.** The handler reads
  `request.headers.get('content-length')` and returns early or falls
  through — no header rewriting, no `request.clone()`, no second
  read of the body. The subsequent `request.json()` call (line 65) is
  unchanged.

### Constraints honored

- **`chatRequestSchema` untouched.** Still
  `z.object({ messages, document, apiKey })` in
  `packages/schemas/src/chat.ts`. No schema drift. (Schema is
  intentionally `z.object` not `z.strictObject` per the JSDoc — `id`
  and `trigger` from `@ai-sdk/svelte` are extras we strip.)
- **`ANTHROPIC_API_KEY` discipline intact.** The BYO-key threading
  (`parsed.data.apiKey` → `streamChat(..., parsed.data.apiKey, ...)`,
  lines 79-84) is unchanged. The 413 path returns *before* anyone
  touches `parsed.data` so there is no apiKey-in-error-log surface
  here.
- **`as UIMessage[]` cast preserved.** Line 80 still has the one-line
  bridge between `chatRequestSchema` (validates structure) and the AI
  SDK (validates each part shape inside `convertToModelMessages`). The
  new guard is upstream of the cast.
- **No `undici` / `node:http.Agent`, no `eslint-disable`, no
  `@ts-ignore`, no `@ts-expect-error`.** Grep over the diff scope
  confirms zero hits.
- **Comment policy.** Both the JSDoc on `MAX_CHAT_PAYLOAD_BYTES`
  (lines 6-13) and the inline block above the guard (lines 49-54)
  explain *why* (threat model + memory-buffer reasoning), not *what*.
  Test JSDoc on `makeOversizeRequest` (lines 37-41) explains why a
  fake header beats actually allocating a megabyte. Matches the project
  rule.

### Tests (positives)

- **Deterministic.** No `setTimeout`, no real network, no fixture
  files. The 413 test fabricates a `Request` with a lying
  `content-length: 1048577` header and an empty body — exercises the
  pre-parse rejection path exactly. The pass-through test uses the
  existing `makeRequest` helper + `streamChatMock.mockResolvedValue`
  pattern — zero drift from the established conventions in the same
  file (other 12 tests use the same helper shape).
- **No tautology.** The 413 test asserts (a) status 413, (b) the exact
  error string `'payload_too_large'`, (c) `limit` equals the constant,
  and (d) `streamChatMock` was NOT called. Item (d) is the load-bearing
  assertion — it proves the guard cuts off the call chain before the
  expensive path. Reverting the guard (commented out lines 55-61
  locally) → test (a)/(b)/(c)/(d) all fail. Restored → all 14 pass.
- **Pass-through test reuses the canonical valid-body shape**
  (`FIXTURE_MESSAGES`, `FIXTURE_DOCUMENT`, `FIXTURE_API_KEY`). If the
  schema ever evolves and the canonical fixture is updated, this test
  inherits the change automatically — no parallel fixture to keep in
  sync.

### Conventions

- **JSDoc on exported / module-scoped surface.** Both the new constant
  and the new test helper have JSDoc. The handler's existing block
  comment (lines 16-47) was preserved verbatim.
- **Commit-message style matches recent history.** `feat(ucs-14v):
  reject /api/chat payloads over 1 MiB with 413` follows the
  `<type>(<bd-id>): <imperative>` shape used by ucs-3bh, ucs-cv7,
  ucs-1qx, ucs-s9c, ucs-m97.

## Needs Decision

- **`content-length`-absent fallthrough is a real but bounded gap.**
  The impl's inline comment (lines 51-54) gives two reasons for not
  rejecting when the header is missing:
  1. "modern fetch clients always set content-length on fixed-size
     bodies" — true for legitimate clients, but an attacker controls
     the client and can omit the header (or send
     `Transfer-Encoding: chunked`) to bypass the guard.
  2. "the schema parse below bounds memory in the no-header case via
     SvelteKit's body limit" — **this is the part to flag**.
     SvelteKit's `bodySizeLimit` (defined in
     `node_modules/.bun/@sveltejs+kit@.../src/exports/node/index.js`
     lines 38-90) is enforced inside `getRequest({ request, base,
     bodySizeLimit })`. That code path is **only used by the Node
     adapter**. The Vercel adapter
     (`node_modules/.bun/@sveltejs+adapter-vercel@.../files/serverless.js`)
     receives a Web `Request` directly from Vercel's runtime and
     passes it to `server.respond(request, ...)` — `getRequest` and
     `bodySizeLimit` are NOT in the call path in production. So the
     comment's appeal to "SvelteKit's body limit" doesn't hold on the
     deployed runtime. The Vercel platform's own body limit (4.5 MB
     for serverless, larger for edge) DOES cap the blast radius — but
     that's a Vercel limit, not a SvelteKit one, and it's >4× the 1
     MiB threshold this PR established.

  **Why I'm not blocking on this:**
   1. The bd acceptance criteria specify "POST /api/chat with request
      body >1 MB returns HTTP 413" — the `content-length` path is
      what they call out, and it's covered. The fallthrough is
      out-of-scope of the explicit ACs.
   2. Even at worst, Vercel's platform-level body limit caps the
      attacker's blast radius at ~4.5 MB (serverless) or ~50 MB
      (edge). That's larger than we want but bounded — not an
      arbitrary-size DoS.
   3. The fix is a small follow-up (read the body to a `Uint8Array`
      with a size cap, or wrap `request.json()` in a streaming
      counter). Worth its own bd issue rather than expanding scope
      here.

  **Recommended follow-up:** file `bd create --type=task --priority=2
  --label=team:agent-impl-team` with title "Harden /api/chat payload
  guard against missing content-length / chunked transfer". Cite this
  review and the SvelteKit + Vercel adapter analysis above. Not a
  merge blocker — file it after merge.

- **Stylistic, not blocking:** the JSDoc on `MAX_CHAT_PAYLOAD_BYTES`
  says "1 MiB" but the comparison is `> MAX_CHAT_PAYLOAD_BYTES`, which
  means exactly 1048576 bytes passes. The acceptance criterion ("body
  <=1 MB passes through") matches the implementation. The
  test-comment phrasing ("at or under the 1 MiB guard") also matches.
  Nothing to change.

## Relevant paths

- `apps/web/src/routes/api/chat/+server.ts` — lines 6-14 (const +
  JSDoc), lines 48-61 (handler guard)
- `apps/web/tests/chat-route.test.ts` — lines 37-83 (helper + two new
  tests)
- `packages/schemas/src/chat.ts` — unchanged, verified `z.object`
  shape and lack of intrinsic size bound on `messages` / `parts`
- `node_modules/.bun/@sveltejs+kit@2.60.1+.../src/exports/node/index.js`
  — lines 11-109 (Node-adapter `bodySizeLimit` enforcement; NOT in
  Vercel adapter call path)
- `node_modules/.bun/@sveltejs+adapter-vercel@6.3.3+.../files/serverless.js`
  — lines 15-42 (entry point; calls `server.respond(request, ...)`
  directly without `getRequest`/`bodySizeLimit`)
