# BYO Anthropic Key — design

Date: 2026-05-20
Status: draft
Topic: bring-your-own-key flow for the deployed Vercel app, no operator key exposure

## Context

The app today reads `ANTHROPIC_API_KEY` from `process.env` on the server
side at `apps/web/src/routes/api/chat/+server.ts:25`. That works for
local dev but blocks public deployment — publishing the app on Vercel
would either (a) require the operator to fund every user's calls from
their own key, or (b) expose the operator's key to abuse. Neither is
acceptable for a public side-project.

We want a path where:

- The operator publishes the app on Vercel without committing or
  funding their own `ANTHROPIC_API_KEY`.
- Each user supplies their own Anthropic key at runtime.
- Nothing about the user's key is persisted — not in the browser
  beyond the live session, not on the server beyond a single function
  invocation.

The current chat pipeline is otherwise preserved: `streamChat`
(`packages/agent/src/agent.ts:27`) with `SYSTEM_PROMPT`, the
`grep_doc` and `finalize` tools, `stepCountIs(10)` and
`hasToolCall('finalize')` stop conditions, and `@ai-sdk/svelte`'s
streaming UI message protocol all stay.

## Goals

1. The deployed app requires no operator-side Anthropic key.
2. Each user supplies their key once per session via a UI field; it
   lives only in browser memory.
3. The server function uses the user's key in a single stack frame to
   construct one Anthropic call, then the key goes out of scope. It is
   never logged, persisted, cached, or echoed back to the client.
4. The threat model and storage behavior are surfaced honestly to the
   user in-product, including the recommendation to set a per-key
   spend cap.
5. Local dev still works — the dev experience is unchanged for the
   operator (they paste their own key into the UI, same as a public
   user would).

## Non-goals

- Persistence of the key across sessions (no `localStorage`, no
  `sessionStorage`, no opt-in toggle).
- A server-side fallback that reads `ANTHROPIC_API_KEY` from env. The
  env-var path is deleted from `apps/web/` entirely. (`.env` use in
  `packages/evals/` is unaffected — those are separate server-side
  tools, not the deployed app.)
- Direct browser → `api.anthropic.com` calls. We deliberately do not
  use the `anthropic-dangerous-direct-browser-access` header path. See
  Architecture for rationale.
- Per-request cost meters, idle-timeout forgetting, hash-of-key
  displays, "encrypted at rest" claims.
- IP allowlists, origin restrictions, or any per-key access controls
  that Anthropic does not offer.
- Preflight validation of the key on save (e.g., a probe call to
  `/v1/models`). The first real chat message validates against
  Anthropic; an extra round-trip on save adds latency and creates
  confusing UX when the probe fails for transient network reasons.
- **Vercel AI Gateway BYOK** (`providerOptions.gateway.byok`). That
  feature proxies through Vercel's gateway and falls back to system
  credentials — completely different threat model from what we're
  building. We call `api.anthropic.com` directly via
  `@ai-sdk/anthropic` and never traverse the gateway.

## Architecture

Two-hop transit, key in memory at each hop, nowhere else.

```
[browser: $state apiKey]
    │
    │ POST /api/chat  { messages, document, apiKey }   (HTTPS body)
    ▼
[Vercel function invocation]
    │  const k = body.apiKey
    │  createAnthropic({ apiKey: k })
    │  streamText(...) → SSE
    ▼
[api.anthropic.com]
    ▲
    │  AI SDK UI message stream
    │
[browser receives stream]
[function returns; k out of scope]
```

The key exists in two memory locations during one chat turn: a Svelte
`$state` rune in the browser tab, and a local `const` in one Vercel
function invocation. Nothing in between persists it.

We use a server proxy rather than direct browser → Anthropic calls
because:

- Anthropic's official guidance ([SDK docs, TypeScript Browser
  usage section](https://platform.claude.com/docs/en/api/sdks/typescript))
  explicitly warns against `dangerouslyAllowBrowser` and lists only
  two scenarios where it might not be dangerous: internal tools with
  trusted users, and dev/debugging. Public BYO-key is not in their
  list of blessed cases.
- A server proxy is the documented happy path. We don't have to opt
  out of the foot-gun guard.
- The CSP we ship is still valuable but no longer load-bearing for
  protecting the key — the key isn't sitting in browser memory while
  arbitrary `fetch` calls go out to Anthropic.
- We retain the option of server-side rate limiting or input sanity
  checks in the future without an architectural reversal.

## Browser-side storage

In-memory only. A Svelte `$state` rune in the app root component or a
top-level `.svelte.ts` module. No `localStorage`, no `sessionStorage`,
no IndexedDB, no Service Worker key vault.

Survives: in-app navigation, route changes inside the SPA.
Does not survive: hard reload, tab close, browser restart.

Hygiene rules:

- After the user submits the key from the entry form, the form's
  `<input>` element value is cleared (`inputEl.value = ''`).
- The `Forget key` button sets the rune to `null`; reactive consumers
  clear.
- `pageshow` listener with `event.persisted === true` forces the rune
  to `null` (defeats bfcache restoration).
- No `$inspect(apiKey)` ever ships; gated behind `import.meta.env.DEV`
  if used during development.
- No logging of the key from any client-side error reporter. (None
  exist today; this is a forward-looking constraint.)

## Server-side discipline

The Vercel function at `/api/chat` is the only server-side place the
key exists. The operator's commitments in code, enforced by review:

- The key is read from the request body once into a local `const` and
  passed only to `createAnthropic({ apiKey })`. It is not stored on
  any module-scope variable, not attached to `globalThis`, not cached.
- `console.log`, `console.error`, and any future logger calls must
  not receive the body object directly. Errors thrown during request
  handling are caught and re-shaped into responses that do not include
  the key or the original body.
- No error reporter (Sentry, etc.) is wired up today. If one is added,
  a `beforeSend` scrubber must redact `apiKey` and the full request
  body. This is called out explicitly in the spec so a future PR can't
  silently undo it.
- **Vercel does not log request bodies by default.** Per Vercel's
  runtime-logs docs, the platform records request metadata (method,
  path, status, region, request ID, user agent) and whatever the
  function code writes via `console.*`. There is no "include request
  bodies in logs" toggle to disable — the only way the key can land
  in logs is if our code writes it. Verification: after deploy, send
  one known chat request, then search runtime logs for the literal
  `sk-ant-` substring; expected count is zero. Code review enforces
  that `console.*` is never called with `parsed`, `parsed.data`, or
  any object that contains `apiKey`.
- The response to the client must not include the key in error bodies
  (e.g., `400 { error: "Invalid key 'sk-ant-xxx'" }` is forbidden;
  `400 { error: "API key rejected by provider" }` is the correct
  shape).
- The `createAnthropic({ apiKey })` provider must be constructed
  *inside* the handler, per request. Caching it at module scope
  keyed by `apiKey` (or by anything else) is forbidden — the cache
  itself would become a cross-user leak.
- **Mid-stream errors must not leak.** Anthropic errors thrown
  *before* the stream begins (e.g., a 401 on connection) surface
  synchronously and are caught by the route's try/catch. Errors
  thrown *after* the response headers have been flushed (e.g.,
  rate-limit during streaming) become `error` parts in the SSE
  stream; the AI SDK's default `onError` calls `String(err)`,
  which could splash `error.responseBody` containing the provider's
  echoed request payload. We override the default:
  `streamText({ ..., onError })` for server-side observation (logs
  a redacted summary; never logs `error.responseBody`), and
  `result.toUIMessageStreamResponse({ onError: () => 'Upstream provider error' })`
  for the client-visible stream chunk. The client receives a fixed
  string regardless of what the provider returned.
- **`AbortSignal` propagation.** The route passes
  `event.request.signal` into `streamChat`, which forwards it to
  `streamText({ abortSignal })`. When the browser navigates away
  or the user hits Stop, the signal aborts the Anthropic fetch and
  the handler returns early. Without this wiring, an abandoned
  stream keeps the function (and the user's spend) alive until
  the Vercel function timeout.
- **Tool execution stays scoped to request input.** The two tools
  (`grep_doc`, `finalize`) execute server-side inside `streamText`.
  `grep_doc` reads only `document.text` from the per-request body;
  `finalize` is a structural-output tool with no side effects.
  Neither tool reads `apiKey`, `process.env`, the filesystem, or
  the network. Any future tool that wants those resources requires
  a fresh threat-model review and must be added to this list.

### Per-request isolation

Each `/api/chat` request runs in its own lexical scope inside the
`POST` handler. The user's key is bound to a `const` in that scope;
concurrent requests each get their own. Vercel reuses serverless
function *instances* across invocations — what's shared between
invocations is module-scope state (top-level variables, anything on
`globalThis`, singleton caches); what's NOT shared is anything
declared inside the handler. The hygiene rules above exist
specifically to keep that isolation intact.

There is no notion of "current user" on the server — the app has no
auth, no sessions, no cookies. Each request is identified only by the
key it carries, and that key authenticates the request to Anthropic,
not to us. Two users hitting `/api/chat` at the same moment are two
HTTP requests with two disjoint stack frames; the server cannot mix
them without an explicit programmer error (e.g., promoting `apiKey`
to module scope, attaching it to `globalThis`, caching the provider).

Streaming responses hold the handler's async chain open for the
duration of the agent loop, sometimes tens of seconds. That's fine —
the open scope belongs to that invocation only. Another request
streaming in parallel has its own scope.

**Runtime caveat: Bun vs. Node fluid concurrency.** Vercel's fluid-
compute concurrency (where multiple invocations share a single Node
process) is currently available on Node.js and Python runtimes only,
not on Bun. Under our current `experimental_bun1.x` runtime,
concurrent users land on **separate** function instances — the
closure-isolation argument is doubly true (different instances, and
different closures within each). If we ever migrate to `nodejs22.x`
(ADR 0001's fallback), in-process concurrency becomes possible and
the closure-isolation discipline above stops being mere hygiene and
becomes safety-normative for cross-user separation. Either way, the
rules are the same; the consequences of breaking them change.

## Threat model — honest disclosure

What is protected:

- The key is never on disk on either the user's machine (in-memory
  only in browser) or the operator's deployment (never persisted).
- An XSS on the app's origin can still exfiltrate the key, but the
  attack surface is reduced by strict CSP (see below).
- Operator-side compromise (someone pushing a malicious code change)
  is the same risk surface as any server-side web app — mitigated by
  open source, branch protection, and review.

What is not protected:

- A user with a compromised browser (extension, malware) can lose the
  key. Out of scope for any web app.
- An XSS on the app's origin during an active session can still
  intercept the key in `$state` or hook `fetch` to read the request
  body. CSP + DOM hygiene + no third-party scripts shrink this to
  near-zero but not zero.
- Anthropic offers no per-key IP allowlist or origin restriction (per
  their [API key best practices article](https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure)).
  A leaked key works from anywhere until revoked.
- **Vercel platform metadata leaks the region and request ID.** Every
  response carries `x-vercel-id` (region + invocation ID) and
  `server: Vercel`. Not a key-leak vector; included here for
  completeness. Strippable via `vercel.json` `headers` if it ever
  becomes a concern — not in scope today.
- **Vercel's 4.5 MB request body limit** is enforced by the platform
  *before* the handler runs. A request exceeding this gets a
  `413 FUNCTION_PAYLOAD_TOO_LARGE` straight from the platform; our
  code does not see it and cannot shape the response. The follow-up
  bd issue `ucs-14v` will move the size check client-side so the
  chat client surfaces a useful message before the request leaves
  the browser.
- **Vercel function max-duration caps streaming length.** On the Hobby
  tier the cap is 300 seconds. An agent loop that exceeds this (e.g.,
  a 10-step `grep_doc` + `finalize` sequence with slow tool calls)
  has its stream truncated by the platform; the client surfaces a
  generic stream-closed error. No key-leak risk, but UX impact worth
  knowing. Mitigation if hit: lower `stepCountIs(10)` or add an
  explicit `export const config = { maxDuration: ... }` once we have
  a real number to set.

In-product disclosure (settings panel copy, exact wording in UX
section below): the user is told (a) the key lives in this browser
session only, (b) the server uses it once per chat turn and discards
it, (c) any script running in this tab can read it during the
session, (d) they should set a per-key spend cap before pasting.

## Content Security Policy

SvelteKit's nonce-mode CSP, set in `svelte.config.js` under
`kit.csp.directives`. Production policy:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'self';
img-src 'self' data:;
font-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

Notes:

- `connect-src 'self'` is sufficient — the browser only talks to our
  own origin (`/api/chat`, `/api/extract`). It never directly contacts
  `api.anthropic.com`.
- `style-src 'unsafe-inline'` is retained because Svelte component
  styles compile to inline `<style>` blocks; `'unsafe-inline'` for
  styles cannot execute code, so the residual risk (CSS-based data
  exfil via `background: url(...)`) is bounded by `img-src` and
  `connect-src`.
- Dev mode (Vite HMR) needs `'unsafe-eval'` and is configured only in
  the dev-mode branch of `svelte.config.js`.
- `frame-ancestors 'none'` blocks clickjacking attempts that might
  trick a user into pasting into a framed copy of the app.

## UX surface

Single settings drawer reachable from a gear icon top-right of the
chat surface. Composer is disabled when no key is set; the placeholder
reads "Add your Anthropic API key in settings to start chatting".

Field shape:

- `<input type="password" autocomplete="off" spellcheck="false">`
- Reveal toggle (eye icon)
- Trim leading/trailing whitespace on paste silently
- Prefix sanity check on save (must start with `sk-ant-`); no network
  preflight (first real chat call validates against Anthropic)

Saved state:

- Last-4 confirmation chip: `sk-ant-•••••••••••A3f9`
- Two buttons: **Replace** (reopens entry) and **Forget key**
- "Forget key" confirms once: *"You'll need to paste the key again to
  chat."*

Error taxonomy (four states, distinct copy):

1. **Not set** — composer disabled, banner directs to settings.
2. **Malformed** — caught at save by the regex check, inline error
   under the input.
3. **Rejected by provider** — 401 from Anthropic. Settings drawer
   auto-reopens with the key field focused; error reads "Your key
   was rejected by Anthropic. Check it's still active in your
   provider dashboard."
4. **Quota / rate** — 429 or insufficient credit. Error reads "Your
   key is valid but Anthropic returned a quota error. Check your
   spend limits or credits." Anthropic's raw error available in a
   collapsible **Details** disclosure.

Threat-model paragraph (visible in the settings drawer under the
chip, not behind a separate "Security" tab):

> Your key is stored in this browser tab only — not on disk, not on
> our servers. Each chat turn sends your key over HTTPS to our server,
> which uses it once to call Anthropic and then discards it. Anything
> that runs in this tab (browser extensions, scripts) can read your
> key while the tab is open. We recommend setting a per-key spend cap
> in your Anthropic Console before pasting it here.

## Code-level changes

### `packages/schemas/src/chat.ts` — modify

- Extend `chatRequestSchema` with `apiKey: z.string().min(1)`.
  Acceptance: a request without `apiKey` fails validation with a
  clear `issues` array; one with a non-string fails likewise.
- The exported `ChatRequest` type updates automatically via `z.infer`.

### `packages/agent/src/agent.ts` — modify

- Replace `import { anthropic } from '@ai-sdk/anthropic'` with
  `import { createAnthropic } from '@ai-sdk/anthropic'`.
- Change `streamChat` signature to
  `streamChat(messages: UIMessage[], document: Document, apiKey: string): Promise<Response>`.
- Inside the function, construct a per-call provider with
  `createAnthropic({ apiKey })` and use `provider('claude-sonnet-4-6')`
  as the `model`. No `headers` option needed — this runs server-side
  and does not require the dangerous-browser-access header.
- All other parameters (`SYSTEM_PROMPT`, tools, `stopWhen`,
  `temperature`) unchanged.

### `apps/web/src/routes/api/chat/+server.ts` — modify

- Remove the `process.env['ANTHROPIC_API_KEY']` check and its 500
  branch (lines 25–27).
- Pass `parsed.data.apiKey` as the third argument to `streamChat`.
- Add a try/catch around `streamChat` that catches Anthropic's
  `AuthenticationError` / `RateLimitError` / `BadRequestError` and
  returns shaped responses (401 / 429 / 400) without echoing the key
  or the original request body.

### `apps/web/src/routes/+page.svelte` — modify

- Add a settings drawer component with the key entry and confirmation
  UI per the UX section.
- Hold `apiKey` in a top-level `$state<string | null>(null)` rune.
- Disable the composer and surface the banner when `apiKey === null`.
- Pass `apiKey` through `DefaultChatTransport.prepareSendMessagesRequest`
  alongside `messages` and `document` (see line 22–24 of the current
  file).
- Wire up `pageshow` listener that nulls the rune on
  `event.persisted === true`.

### `apps/web/svelte.config.js` — modify

- Add `kit.csp = { mode: 'nonce', directives: { ... } }` with the
  policy described in the CSP section.
- Dev-mode branch: include `'unsafe-eval'` in `script-src` only when
  `process.env.NODE_ENV !== 'production'`.

### `apps/web/tests/chat-route.test.ts` — modify

- Remove the two tests that exercise `ANTHROPIC_API_KEY` env behavior
  (lines around 50–58 in the current file).
- Add tests for: (a) missing `apiKey` in body → 400 with `issues`,
  (b) malformed `apiKey` shape → 400, (c) request with valid
  `apiKey` reaches the (mocked) `streamChat` call with the key passed
  through.

### New file — `apps/web/src/lib/components/SettingsDrawer.svelte`

- The settings drawer component described in the UX section.
- Acceptance: renders entry form when `apiKey === null`; renders
  last-4 chip + Replace + Forget when set; emits events / mutates
  bound state for save and forget; contains the threat-model
  paragraph as static copy.

### `packages/agent/tests/agent.test.ts` — modify

- Update any test that calls `streamChat` to pass a third `apiKey`
  argument (test fixture: `'sk-ant-test-key'`).
- Verify the mock provider receives the key by intercepting
  `createAnthropic`'s call args.

## References

- Anthropic TypeScript SDK docs, "Runtime support → Browser usage":
  [platform.claude.com/docs/en/api/sdks/typescript](https://platform.claude.com/docs/en/api/sdks/typescript)
  — verbatim quote of the danger warning and the two "might not be
  dangerous" scenarios is in the Architecture section above.
- Anthropic API key best practices:
  [support.claude.com/en/articles/9767949](https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure)
  — confirms no IP allowlist or origin restriction; recommends spend
  limits and rotation.
- `@anthropic-ai/sdk@0.93.0` source: the browser guard error message
  and the `anthropic-dangerous-direct-browser-access: 'true'` header
  injection are at `client.mjs:84-85` and `client.mjs:722-723`
  respectively in the installed bundle. Not used by this design —
  noted only because the research that produced this spec verified
  them directly.
- PR that introduced browser support in the Anthropic TypeScript
  SDK: [anthropics/anthropic-sdk-typescript#504](https://github.com/anthropics/anthropic-sdk-typescript/pull/504)
  (merged 2024-08-21). Not used by this design.
- Prior spec for the current `/api/chat` shape:
  `docs/specs/2026-05-18-rfc2324-chat-mvp.md`.
- Prior spec for the `document` field in the chat request body:
  `docs/specs/2026-05-19-url-fetcher.md`.
