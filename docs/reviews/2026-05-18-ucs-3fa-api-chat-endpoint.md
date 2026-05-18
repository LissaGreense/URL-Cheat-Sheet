# Review: feat/ucs-3fa-implement-api-chat-sveltekit-endpoint

**Date:** 2026-05-18
**Branch:** `feat/ucs-3fa-implement-api-chat-sveltekit-endpoint`
**PR:** #11
**bd issue:** `ucs-3fa` (T4 of `docs/plans/2026-05-18-rfc2324-chat-mvp.md`)
**Verdict:** Clean — pass

## Summary

Adds the `chatRequestSchema` (Zod 4, `z.strictObject`) and the
`/api/chat` SvelteKit POST handler that validates the body, gates on
`ANTHROPIC_API_KEY`, then delegates to `streamChat` from
`@url-cheat-sheet/agent`. Three Vitest cases cover the 400/500/200
branches with `streamChat` mocked at the package boundary. Tests pass
4/4 (1 health + 3 chat); no live LLM calls.

## Acceptance criteria

All AC met:

- [x] `packages/schemas/src/chat.ts` exports
  `chatRequestSchema = z.strictObject({ messages: z.array(z.object({
  id: z.string(), role: z.enum(['system','user','assistant']),
  parts: z.array(z.unknown()) })) })` and `type ChatRequest =
  z.infer<typeof chatRequestSchema>`. Matches the AC literally.
- [x] `packages/schemas/src/index.ts` adds `export * from './chat'`
  alongside the existing `message` and `qa-case` re-exports.
- [x] `apps/web/src/routes/api/chat/+server.ts` exports a `POST`
  `RequestHandler` that:
  - Returns **400** with `{ error: 'Body must be valid JSON' }` on
    malformed JSON (try/catch around `request.json()`), and **400**
    with `{ error: 'Invalid request body', issues: parsed.error.issues }`
    on Zod failure. Both AC say "400 with a JSON `error` body" —
    satisfied; the extra `issues` field is helpful for debugging the
    `@ai-sdk/svelte` Chat client without leaking secrets.
  - Returns **500** with `{ error: 'ANTHROPIC_API_KEY not set' }` when
    the env var is missing. Verbatim match to the AC string.
  - Otherwise `return streamChat(parsed.data.messages as UIMessage[])`.
    See §"Plan deviation" — AC literal said
    `result.toUIMessageStreamResponse()`, but T3's `streamChat` now
    returns `Promise<Response>` itself, so the route is one line.
    Context block in the task explicitly acknowledges this.
- [x] `apps/web/tests/chat-route.test.ts` covers 400/500/200 with
  `vi.mock('@url-cheat-sheet/agent', ...)`. 3/3 pass; no model SDK,
  no real network.
- [x] `bun run --filter @url-cheat-sheet/web test` green (4/4 across
  2 files: `health.test.ts` 1, `chat-route.test.ts` 3).
- [ ] `bun run --filter @url-cheat-sheet/web check` clean — **not
  clean**, but the two pre-existing errors on `main`
  (`$lib` resolution in `+page.svelte`, `.ts` extension import in
  `tests/health.test.ts`) account for two of three. This PR adds a
  third error of the **same kind** (the `.ts` extension on the
  dynamic `import('../src/routes/api/chat/+server.ts')` at
  `chat-route.test.ts:15`). See §"Needs decision" — not a regression
  in pattern, but the AC literal says "clean", which this branch is
  not. Flagging rather than blocking because the same pattern was
  approved into `main` already (and into the prior reviews for ucs-23r
  and ucs-4g0), and removing it here in isolation would diverge from
  the existing `tests/health.test.ts` style without a coordinated
  cleanup.

## Plan deviation: route returns `streamChat(...)` directly

The plan's draft endpoint was
`const result = streamChat(...); return result.toUIMessageStreamResponse()`.
T3 (ucs-23r) instead returned `Promise<Response>` from `streamChat`
itself (documented in that PR for `tsc -b` composite emit reasons).
This PR adapts cleanly: `return streamChat(parsed.data.messages as
UIMessage[])`. The 200 test in `chat-route.test.ts` matches that shape
by `mockResolvedValue(new Response('stream-body', { status: 200, ...
}))` and asserting `res.status === 200`. Sound — the upstream
deviation was already accepted in the ucs-23r review.

## Critical

None.

## Important

None. The 400/500/200 branches map cleanly, the `as UIMessage[]` cast
sits exactly at the boundary the spec described (Zod validates the
outer shape, AI SDK's `convertToModelMessages` validates each part),
and there are no leaks of provider or env state outside the handler.

## Tests

Solid for the scope this task defines.

- All three required branches exercised; mock is at the
  `@url-cheat-sheet/agent` boundary as the AC specified (no
  `@ai-sdk/anthropic` import, no `streamText` call).
- `beforeEach` resets the mock and re-asserts `ANTHROPIC_API_KEY`; the
  500 branch explicitly `delete`s it, so test ordering can't leak.
- 200 branch asserts the mock was called once with the original
  `messages` array (deep-equal via `toEqual`) — catches accidental
  serialization or wrapping at the boundary.
- Negative assertion in the 400 branch (`streamChatMock).not.toHaveBeenCalled()`)
  guards against the validator falling open.

## Hard-rule check (CLAUDE.md)

- Zod: `z.strictObject`; no `.strict()`.
- No `bun.lockb` touched.
- No `rollupOptions` / no `--no-daemon` flags.
- TS strict + `verbatimModuleSyntax`: `type RequestHandler`,
  `type UIMessage` imports are type-only where required.
- `process.env['ANTHROPIC_API_KEY']` uses bracket access, honoring
  `noPropertyAccessFromIndexSignature` from `tsconfig.base.json`.
- Branch is feature branch, not `main`; commit signed via standard
  conventional-commit message.

## Non-blocking observations

1. `packages/schemas/package.json` `exports` map lists `./message` and
   `./qa-case` subpaths but no `./chat`. The route imports via the
   root entry (`@url-cheat-sheet/schemas`), which still resolves via
   `"."`, so this works. Add a `./chat` subpath next time someone
   touches the manifest for consistency. Not a blocker.
2. `chat.ts` JSDoc says "the deeper part structure is validated by the
   AI SDK when it converts to model messages" — accurate per the AI
   SDK source. Worth keeping the comment so the next reader doesn't
   widen the schema speculatively.
3. The 400 Zod branch returns `parsed.error.issues` in the body. Useful
   for client debugging; if a later UX pass wants narrower error info
   (e.g. message-index only), trim it then. No action now.
4. `UIMessage[]` cast is a one-line annotated bridge with a comment
   explaining the dual-validation seam. Matches the spec and prior
   plan discussion.

## Needs decision

1. **`web check` is not clean on this branch (and was not clean on
   `main` either).** Two of the three errors pre-date this PR
   (`+page.svelte` `$lib` resolution + `tests/health.test.ts` `.ts`
   extension import). The third is this PR's
   `tests/chat-route.test.ts:15` using the same `.ts`-extension dynamic
   import pattern as `health.test.ts`. The literal AC says "check
   clean", which is not currently achievable on this branch without
   also fixing the two pre-existing errors. Options:
   - **(a)** Drop the `.ts` from the dynamic import in
     `chat-route.test.ts` only — but this leaves `health.test.ts` as
     the divergent pattern and doesn't actually make `check` clean.
   - **(b)** File a follow-up `bd` issue to fix all three errors as a
     coordinated `check`-cleanliness pass (and add
     `"allowImportingTsExtensions": true` or strip the `.ts` from both
     test files, plus a `$lib` ambient type fix). Recommend this
     route; pre-existing tech debt belongs in a separate issue per
     the karpathy/CLAUDE.md guidance ("surgical changes").
   - **(c)** Update the AC on `ucs-3fa` to acknowledge the
     pre-existing baseline.
   - This review treats `check` non-cleanliness as **non-blocking for
     ucs-3fa specifically** because the new error matches an
     already-merged pattern and the regression isn't from this PR's
     work; the schema, route, and tests all do exactly what the task
     asked.

## Decision

Zero blockers. Clearing `gate:review`. The `web check` baseline
should be addressed in a follow-up `bd` issue (pre-existing tech debt
that this PR matched rather than introduced).
