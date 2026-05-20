# BYO Anthropic Key — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the operator's `process.env.ANTHROPIC_API_KEY` with a
per-request user-supplied key, transit-only through a Vercel function,
held in-memory in the browser, never persisted.

**Architecture:** Server proxy. Browser holds the user's key in a Svelte
`$state` rune; each chat turn sends `{ messages, document, apiKey }` to
`/api/chat`; the function constructs a per-request `createAnthropic`
provider inside the handler, calls `streamText`, returns the stream;
the key goes out of scope when the function returns.

**Tech stack:** SvelteKit 2.x (adapter `experimental_bun1.x`), Svelte 5
runes, Zod 4 (`z.strictObject` / `z.string`), `ai` v6 (`streamText`),
`@ai-sdk/anthropic` v3 (`createAnthropic`), Vitest 3.

**Reference spec:** `docs/specs/2026-05-20-byo-anthropic-key.md`.
Read it before starting any task — the threat model, server-side
discipline rules, and per-request isolation requirements are not
re-stated here; they are normative for the implementation.

---

## Per-task convention

Per the repo's plan-writing rule (`using-this-repo` skill, §
"Plan-writing conventions"): each task lists **interface signatures**,
**acceptance criteria**, **library calls by name**, **affected files**,
and **test scenarios** — but **does not paste verbatim implementation
or test bodies**. The implementing agent reconciles signatures against
the installed `.d.ts` files; library APIs drift between training-data
snapshots and the lockfile.

If a task asks you to "use `createAnthropic({ apiKey })`": find the
option shape in `node_modules/@ai-sdk/anthropic/dist/index.d.ts`
(verified in the spec to be the exported `createAnthropic` factory with
`{ apiKey, baseURL?, authToken?, headers?, fetch?, generateId?, name? }`).
Do not copy a call site from this plan.

---

## File map

| Path | Action | Owner-team consideration |
|---|---|---|
| `packages/schemas/src/chat.ts` | modify | schemas |
| `packages/agent/src/agent.ts` | modify | agent |
| `packages/agent/tests/agent.test.ts` | modify | agent |
| `apps/web/src/routes/api/chat/+server.ts` | modify | web |
| `apps/web/tests/chat-route.test.ts` | modify | web |
| `apps/web/src/lib/components/SettingsDrawer.svelte` | create | web |
| `apps/web/src/routes/+page.svelte` | modify | web |
| `apps/web/svelte.config.js` | modify | web |

---

## Task 1 — Extend `chatRequestSchema` with `apiKey`

**Files**
- Modify: `packages/schemas/src/chat.ts`

**Interface**
- `chatRequestSchema` gains a required `apiKey` field.
- Field type: `z.string().min(1)` (any non-empty string). Format
  validation (`sk-ant-` prefix) is enforced UX-side, not at the schema
  boundary, so the schema does not over-constrain — a corporate prefix
  variant or future Anthropic key shape change does not break the
  endpoint.
- `ChatRequest` type updates automatically via `z.infer`.

**Acceptance criteria**
- A request body missing `apiKey` fails `chatRequestSchema.safeParse`
  with a non-empty `error.issues` array.
- A request body with `apiKey: ''` (empty string) fails.
- A request body with `apiKey: 123` (non-string) fails.
- A request body with a non-empty string `apiKey`, valid `messages`,
  and valid `document` passes.

**Library calls**
- `z.object`, `z.string`, `.min`, `z.infer`. No new imports beyond
  what `chat.ts` already uses.

**Test scenarios** (live in `packages/schemas/tests/` if a chat-schema
test file exists; otherwise add `packages/schemas/tests/chat.test.ts`
with a fresh `describe('chatRequestSchema')`):
- Parses a known-good body (existing fixture shape + `apiKey`).
- Rejects when `apiKey` is missing.
- Rejects when `apiKey` is empty.
- Rejects when `apiKey` is not a string.

**Steps**
- [ ] **1.1** Locate `packages/schemas/src/chat.ts` and read the
      current `chatRequestSchema` definition.
- [ ] **1.2** Add the `apiKey` field. Re-export `ChatRequest` via
      `z.infer` — already done at line 26, no change needed.
- [ ] **1.3** Find or create `packages/schemas/tests/chat.test.ts`.
      Add the four test scenarios above. Use a fixture object that
      lives at the top of the file; do not duplicate it inside each
      `it`.
- [ ] **1.4** Run from repo root: `bun test --filter @url-cheat-sheet/schemas`.
      Expected: all schema tests pass.
- [ ] **1.5** Commit. Message: `feat(schemas): add apiKey to chatRequestSchema`.

---

## Task 2 — Per-request provider in `streamChat`

**Files**
- Modify: `packages/agent/src/agent.ts`
- Modify: `packages/agent/tests/agent.test.ts`

**Interface change**
- Current: `streamChat(messages: UIMessage[], document: Document): Promise<Response>`
- New: `streamChat(messages: UIMessage[], document: Document, apiKey: string, abortSignal?: AbortSignal): Promise<Response>`
- `apiKey` is required (no default). `abortSignal` is optional but
  the route always passes `event.request.signal`.

**Implementation guidance**
- Replace the module-level `import { anthropic } from '@ai-sdk/anthropic'`
  with `import { createAnthropic } from '@ai-sdk/anthropic'`.
- Inside `streamChat`, construct the provider per call:
  `const provider = createAnthropic({ apiKey })`. **Do not** hoist
  this to module scope; doing so creates a cross-user cache
  (spec § "Server-side discipline" forbids this).
- Pass `provider('claude-sonnet-4-6')` to `streamText`'s `model`
  option. Everything else is unchanged: `SYSTEM_PROMPT`, the full
  tools set (which now includes `grep_doc`, `finalize`, `outline`,
  `read_lines` after the ucs-ec6 navigation-tools landing),
  `stopWhen: [stepCountIs(STEP_BUDGET), hasToolCall('finalize')]`,
  `temperature: 0`, and the `prepareStep` callback that forces
  `toolChoice: finalize` at `FORCE_FINALIZE_AT_STEP`. **Preserve
  all of this verbatim** — these are the 3-layer empty-output
  prevention scheme from ucs-0f3 + ucs-ec6; the impl agent must
  not "simplify" them while wiring in the per-request provider.
- Pass `abortSignal` into `streamText({ abortSignal })`. When the
  client navigates away or aborts, the signal propagates through
  to the Anthropic fetch and stops billing.
- Pass an `onError` handler into `streamText` that logs a redacted
  summary (e.g., `{ kind: 'streamText.error', statusCode: err.statusCode }`)
  and **never** calls `console.*` with `err.responseBody` or any
  object that may transitively contain the request body.
- Pass an `onError` into `result.toUIMessageStreamResponse({ onError })`
  that returns a fixed string — `'Upstream provider error'` — for
  every error. The default behavior (`String(err)`) could splash
  the provider's error body, which may echo the request payload.
  Locking to a fixed string makes in-stream errors safe regardless
  of what Anthropic returns.
- Do **not** add the `anthropic-dangerous-direct-browser-access`
  header — this call runs server-side; the header is for direct-
  browser calls only and we are explicitly not using that path
  (spec § "Architecture").

**Acceptance criteria**
- `streamChat` requires a `string` apiKey at the type level (callers
  fail `bunx tsc` without it).
- The function constructs a fresh provider on each invocation.
- All existing agent configuration is preserved verbatim:
  `SYSTEM_PROMPT`, all four tools (`grep_doc`, `finalize`,
  `outline`, `read_lines`), `stopWhen`, `temperature`, AND the
  `prepareStep` callback with `FORCE_FINALIZE_AT_STEP` logic.
  (The repo state on main moved past the original "10 step
  budget, 2 tools" assumption — see ucs-ec6 + ucs-0f3.)
- No module-scope variable holds `apiKey`, the provider, or any
  derivative.

**Library calls**
- `createAnthropic` from `@ai-sdk/anthropic` (verified exported by
  installed v3.0.78; option shape in `dist/index.d.ts`).
- `streamText` from `ai` (unchanged from current usage).
- All other imports unchanged.

**Test scenarios**
- `streamChat` rejects at compile time if `apiKey` is omitted (the
  TS check during `bun test` will catch this; no runtime assertion
  needed).
- Existing tests in `agent.test.ts` pass after being updated to
  supply a third argument.
- A new test asserts the mock `streamText` is called with a `model`
  produced by `createAnthropic({ apiKey })` — verify by spying on
  `createAnthropic` or by inspecting the `model` argument shape.

**Steps**
- [ ] **2.1** Open `packages/agent/src/agent.ts`. Change the import
      from the `anthropic` singleton to `createAnthropic`.
- [ ] **2.2** Update the function signature and body per the
      "Implementation guidance" above.
- [ ] **2.3** Update `packages/agent/tests/agent.test.ts`. Existing
      tests that call `streamChat` must now pass `'sk-ant-test'`
      (or similar) as the third argument.
- [ ] **2.4** Add one new test asserting that `createAnthropic` is
      called with the supplied apiKey. Mock the module via
      `vi.mock('@ai-sdk/anthropic')`; intercept the factory call.
- [ ] **2.5** Run: `bun test --filter @url-cheat-sheet/agent`.
      Expected: all agent tests pass.
- [ ] **2.6** Commit. Message:
      `feat(agent): per-request provider via createAnthropic`.

---

## Task 3 — Chat route: thread apiKey, shape errors

**Files**
- Modify: `apps/web/src/routes/api/chat/+server.ts`
- Modify: `apps/web/tests/chat-route.test.ts`

**Interface change**
- Remove the `process.env['ANTHROPIC_API_KEY']` check (current lines
  25–27 of `+server.ts`).
- The handler signature receives the full SvelteKit `RequestEvent`;
  destructure both `request` and `request.signal` (for abort
  propagation, per Task 2).
- Call `streamChat(parsed.data.messages as UIMessage[], parsed.data.document, parsed.data.apiKey, request.signal)`.
- Wrap the `streamChat` call in a try/catch that maps the AI SDK's
  error classes to shaped JSON responses **without echoing the key
  or the raw request body** in any response. Verified against
  installed source `node_modules/.bun/@ai-sdk+provider@3.0.10/...`:
  the error classes live in `@ai-sdk/provider` and are re-exported
  from `ai`. Use:
  ```ts
  import { APICallError, LoadAPIKeyError } from 'ai';
  ```
  Branch logic:
  - `APICallError.isInstance(err)` and `err.statusCode === 401`
    → `401 { error: 'API key rejected by provider' }`
  - `APICallError.isInstance(err)` and `err.statusCode === 429`
    → `429 { error: 'Provider rate limit or quota exceeded' }`
  - `APICallError.isInstance(err)` for any other status (including
    `undefined`) → `502 { error: 'Upstream provider error' }`
  - `LoadAPIKeyError.isInstance(err)` → `400 { error: 'API key missing or malformed' }`
    (handles the edge where the schema is loosened and an empty
    `apiKey` reaches the provider — defense in depth)
  - Anything else re-throws (lets SvelteKit's default handler 500).

  The `.isInstance` static methods use Symbol-based markers that
  work across realms (verified in `@ai-sdk/provider/dist/index.d.ts:391-417`);
  prefer them over `instanceof`. **The class names
  `AuthenticationError` / `RateLimitError` / `BadRequestError`
  do NOT exist in `@ai-sdk/anthropic` or `ai` — do not import them.**

  Note that errors thrown *after* `streamText` has started
  streaming surface as in-stream `error` parts, not synchronously.
  Those are handled by the `onError` overrides in Task 2, not here.

**Acceptance criteria**
- The handler returns 400 with a structured `issues` array when
  `apiKey` is missing from the body (this is enforced by the
  schema; surfaces via the existing `safeParse` branch).
- The handler returns 200 + streamed body when given a valid
  request (mocked `streamChat`).
- Error responses do **not** include the `apiKey`, the original
  body, or any substring matching `/sk-ant-/`.
- No `console.log`, `console.error`, or other logger call receives
  the parsed body or `apiKey`.
- Verification that no `console.*` call receives the parsed body
  or `apiKey`: after deploy, send one known chat request, then
  grep Vercel runtime logs for the literal `sk-ant-` substring;
  expected count is zero. (There is no "include request body in
  logs" Vercel setting — that's a misconception in earlier drafts.
  Vercel never logs bodies by default; the only leak path is our
  own `console.*` writes.)

**Library calls**
- `chatRequestSchema.safeParse` (unchanged).
- `streamChat` (Task 2 signature, now with `request.signal` as
  the 4th argument).
- `json` from `@sveltejs/kit` (unchanged).
- `APICallError` and `LoadAPIKeyError` from `ai` (re-exported from
  `@ai-sdk/provider`). Use `.isInstance(err)` for the discriminator.

**Test scenarios** (`apps/web/tests/chat-route.test.ts`)

Tests to remove:
- `'500s when ANTHROPIC_API_KEY is missing'` (lines ~50–58 of the
  current file).
- The `process.env['ANTHROPIC_API_KEY'] = 'test-key'` in
  `beforeEach`.

Tests to add:
- `'400s when apiKey is missing from body'` — request omits
  `apiKey`, expect 400 with `issues` array.
- `'400s when apiKey is empty string'`.
- `'200s and forwards apiKey to streamChat on a valid body'` —
  assert `streamChatMock.mock.calls[0]?.[2]` equals the supplied key.
- `'does not include apiKey in any error response body'` — give an
  invalid body, read the response JSON, assert no value in the
  response contains the apiKey value.

Existing tests to update:
- `'streams the agent response on a valid body'` — the fixture body
  needs `apiKey: 'sk-ant-test'`; the assertion on
  `streamChatMock.mock.calls[0]?.[1]` is still `FIXTURE_DOCUMENT`;
  add `[2]` assertion for the key.
- `'accepts the @ai-sdk/svelte Chat client payload'` — same fixture
  update.

**Steps**
- [ ] **3.1** Open `+server.ts`. Remove the env check (lines 25–27).
      Add the third argument to the `streamChat` call.
- [ ] **3.2** Wrap the call in try/catch with the three shaped
      branches (401 / 429 / 502 / rethrow). Find the error class
      names by inspecting installed `.d.ts` per the guidance above.
- [ ] **3.3** Open `chat-route.test.ts`. Remove the two listed
      pieces, add the four listed tests, update the two existing
      tests' fixtures.
- [ ] **3.4** Run: `bun test --filter @url-cheat-sheet/web -t 'POST /api/chat'`.
      Expected: all chat-route tests pass.
- [ ] **3.5** Commit. Message:
      `feat(web): thread user-supplied apiKey through /api/chat`.

---

## Task 4 — `SettingsDrawer.svelte` component

**Files**
- Create: `apps/web/src/lib/components/SettingsDrawer.svelte`

**Interface (Svelte 5 runes props)**
```ts
type Props = {
  /** Two-way bound: null when no key set, the key string when set. */
  apiKey: string | null;
};
```
Use `let { apiKey = $bindable() }: Props = $props()` to allow the
parent to do `<SettingsDrawer bind:apiKey={apiKey} />`.

**Component states**
The component renders one of two views:
1. **Entry view** (when `apiKey === null`): a `<form>` with one
   `<input type="password" autocomplete="off" spellcheck="false">`,
   an eye-toggle button for reveal, and a Save button. On submit,
   trim leading/trailing whitespace and (if non-empty) write to
   the bound `apiKey`. Clear the input element value
   (`inputEl.value = ''`) after writing.
2. **Saved view** (when `apiKey !== null`): a confirmation chip
   showing `sk-ant-•••••••••••<last4>` (mask middle, show last 4),
   a **Replace** button (sets `apiKey = null`, returns to Entry view),
   and a **Forget key** button (sets `apiKey = null` after a one-step
   inline confirmation — no native `confirm()` dialog).

**Static content (verbatim copy)**
Underneath the entry input, render the threat-model paragraph from
the spec verbatim. The exact text (copy from the spec, don't
paraphrase):

> Your key is stored in this browser tab only — not on disk, not on
> our servers. Each chat turn sends your key over HTTPS to our
> server, which uses it once to call Anthropic and then discards it.
> Anything that runs in this tab (browser extensions, scripts) can
> read your key while the tab is open. We recommend setting a per-key
> spend cap in your Anthropic Console before pasting it here.

**Validation**
On Save:
- Trim whitespace.
- If empty after trim, do not write — show inline error
  *"Enter a key"*.
- If not starting with `sk-ant-`, do not write — show inline error
  *"This doesn't look like an Anthropic key (expected `sk-ant-…`)"*.
  (Allow override via a hidden `data-debug` attribute? No — keep it
  strict for now; a future user complaint can relax it.)
- Otherwise, set the bound `apiKey`, clear the input element,
  switch to Saved view.

**Acceptance criteria**
- Renders Entry view when `apiKey === null`.
- Renders Saved view with last-4 chip when `apiKey` is set.
- The threat-model paragraph copy matches the spec byte-for-byte.
- Save trims whitespace before validation.
- Save rejects empty / wrong-prefix with inline errors.
- After Save, `inputEl.value === ''` (verified by querying the DOM
  in a test).
- Forget key resets the bound `apiKey` to `null`.

**Library calls**
- Svelte 5 runes: `$state`, `$props`, `$bindable`, `$derived`. No
  Svelte 4 stores; this is a new component.

**Test scenarios** (new file `apps/web/tests/SettingsDrawer.test.ts`,
using `@testing-library/svelte` already in devDependencies)
- Renders entry form when no key.
- Save with empty value shows the "Enter a key" error.
- Save with `"foo"` shows the prefix error.
- Save with `"sk-ant-abc123def456"` writes to bound state, clears
  the input, switches to saved view with chip showing last 4
  (`...f456`).
- Forget key reverts to entry view and clears the bound state.

**Steps**
- [ ] **4.1** Create the file. Reference an existing Svelte 5
      component in the repo for runes idioms (e.g., the chat
      composer in `+page.svelte` uses `$state` / `$derived`).
- [ ] **4.2** Build the Entry view with the input, reveal toggle,
      Save button, inline error region, and the threat-model
      paragraph as static markup.
- [ ] **4.3** Build the Saved view with the chip + Replace + Forget.
- [ ] **4.4** Create `apps/web/tests/SettingsDrawer.test.ts`.
      Implement the five test scenarios above using
      `@testing-library/svelte` + `vitest`. Reference: any existing
      `*.test.ts` next to a Svelte component in the repo, or the
      package README at `node_modules/@testing-library/svelte/`.
- [ ] **4.5** Run: `bun test --filter @url-cheat-sheet/web -t SettingsDrawer`.
      Expected: all SettingsDrawer tests pass.
- [ ] **4.6** Commit. Message:
      `feat(web): SettingsDrawer component for BYO key entry`.

---

## Task 5 — Page integration: drawer, state, transport, bfcache guard

**Files**
- Modify: `apps/web/src/routes/+page.svelte`
- Modify (likely): `apps/web/src/lib/components/states/ReadyState.svelte`
  — this is where the chat composer now lives after the
  cinematic-memex-hud Phase 1 landings (ucs-9g9 / ucs-wny). The
  impl agent should locate the composer (search for `<Composer />`
  or the existing `chatInput` binding) and apply the apiKey
  gating there, while keeping the `apiKey` rune at the top-level
  `+page.svelte` and threading it down via prop.
- Modify (likely): `apps/web/src/lib/components/states/IdleState.svelte`
  — the "Add your Anthropic API key in settings to start chatting"
  banner copy may belong here if IdleState is what renders when
  no URL is loaded; alternative is top-level in `+page.svelte`.
  Impl agent decides based on the state-component contract.

**State changes**
- Add a top-level rune in `+page.svelte`: `let apiKey = $state<string | null>(null);`.
- Optionally add a `drawerOpen = $state(false)` rune to control the
  drawer's open/closed state.
- The `apiKey` is passed *down* into whichever state component owns
  the composer (likely `ReadyState`, which currently receives the
  `Chat` instance as a prop). The composer's disabled/placeholder
  logic reads the prop.

**UI changes**
- Add a gear-icon button in the top-right of the page (sibling to
  the `<h1>`). Clicking it toggles the settings drawer.
- Render `<SettingsDrawer bind:apiKey />` inside the drawer.
- The chat composer (`<form onsubmit={sendChat}>` at line 211) is
  disabled when `apiKey === null`. Update the placeholder text on
  the `<input>` to: *"Add your Anthropic API key in settings to
  start chatting"* when no key.
- The composer's existing `disabled` condition (line 217) extends
  with `|| apiKey === null`.
- The submit button's existing `disabled` condition (line 219)
  likewise.

**Transport wiring**
- Update `prepareSendMessagesRequest` (lines 22–24) to include
  `apiKey` in the body:
  ```ts
  prepareSendMessagesRequest: ({ messages }) => ({
    body: { messages, document, apiKey }
  })
  ```
  (Inline closure captures `apiKey` and `document` runes reactively
  via Svelte 5's effect system — same pattern as the existing
  `document` capture.)

**bfcache guard**
- Add a `$effect.root` or `onMount` handler that registers a
  `pageshow` listener: when `event.persisted === true`, set
  `apiKey = null`. Clean up on unmount. This prevents the browser
  from restoring a session with the key still loaded after the
  user has navigated away.

**Client-side error handling (per spec § Error taxonomy)**

Verified against installed source (`ai/dist/index.d.ts:3766,3878`):
the `@ai-sdk/svelte` `Chat` client exposes `chat.error: Error | undefined`
and `chat.status: 'submitted' | 'streaming' | 'ready' | 'error'`. The
`error` is a plain `Error`; the HTTP status code is **not** directly
exposed via the type. To branch on status without threading a custom
`fetch` through `DefaultChatTransport`, parse `chat.error.message`
against the exact strings the server returns from Task 3.

Match against `chat.error.message`:

- contains `'API key rejected by provider'` → open the settings
  drawer, set `apiKey = null`, focus the key input. Show inline
  error in the drawer: *"Your key was rejected by Anthropic. Check
  it's still active in your provider dashboard."*
- contains `'Provider rate limit or quota exceeded'` → surface an
  inline message above the composer: *"Provider rate limit or
  quota exceeded — check your Anthropic spend limits."* Do **not**
  clear `apiKey`.
- contains `'API key missing or malformed'` → same flow as the
  401 branch (forces re-entry).
- contains `'Upstream provider error'` (or anything else) → generic
  inline message above the composer.

The page reads `chat.error` reactively (`$derived` rune) and routes
to one of those branches via a `$effect`. The drawer-open + focus
plumbing is handled via a `drawerOpen = $state(false)` rune in the
page; on a 401 the `$effect` sets `apiKey = null`, `drawerOpen = true`,
then `tick()` + focus the input ref.

**Important:** matching on message-string substrings is fragile if
the server response shape ever changes. Task 3's response shapes
are the *contract*; the strings above are normative. If they
change, both Task 3 and Task 5 must update together.

**Acceptance criteria**
- A fresh page load shows `apiKey === null` and the composer is
  disabled with the prompt to add a key in settings.
- Opening the settings drawer, entering a valid key, and saving
  sets `apiKey` to the entered string and enables the composer.
- Sending a chat message sends a request body containing
  `{ messages, document, apiKey }`.
- Reloading the page (hard reload) returns to `apiKey === null`.
- Bfcache restoration (e.g., back-button to this page after
  navigating away) sets `apiKey` to `null` via the `pageshow`
  listener.
- The existing extract + flagged-page + chat flow (lines 28–122)
  is unchanged in behavior; only the *additional* gate is the
  key requirement.

**Library calls**
- Svelte 5 runes (`$state`, `$derived`, `$effect`), unchanged.
- `Chat` from `@ai-sdk/svelte`, `DefaultChatTransport` from `ai` —
  unchanged at the import level.
- Browser `pageshow` event (standard DOM API).

**Test scenarios**
- Manual smoke test (Task 7) covers most of this. Optionally add
  a `+page.test.ts` that mounts the page, asserts the composer is
  disabled initially, and asserts the placeholder text. Skip more
  intricate UI tests — the integration is small enough that the
  manual smoke is the higher-value check.

**Steps**
- [ ] **5.1** Add the `apiKey` rune at the top of the `<script>`
      block, alongside `state` and `urlInput` (line 13).
- [ ] **5.2** Import `SettingsDrawer` from
      `$lib/components/SettingsDrawer.svelte`.
- [ ] **5.3** Add the gear-icon button and the drawer markup. The
      gear can be Unicode `⚙` for now; visual polish is out of
      scope.
- [ ] **5.4** Update the composer `disabled` props and placeholder.
- [ ] **5.5** Extend `prepareSendMessagesRequest` to include
      `apiKey` in the body.
- [ ] **5.6** Add the `pageshow` listener via `$effect` or a
      mount-time handler. Verify cleanup.
- [ ] **5.7** Wire the four-state error handling per the
      "Client-side error handling" guidance above. The 401 case
      requires the drawer to re-open and focus the key input.
- [ ] **5.8** Run: `bun --filter @url-cheat-sheet/web check`.
      Expected: svelte-check passes with zero errors.
- [ ] **5.9** Commit. Message:
      `feat(web): wire BYO-key drawer into the chat page`.

---

## Task 6 — Strict CSP via SvelteKit nonce mode

**Files**
- Modify: `apps/web/svelte.config.js`

**Interface change**
Extend the existing `kit` config block with a `csp` directive.

```js
kit: {
  adapter: adapter({ runtime: 'experimental_bun1.x' }),
  csp: {
    mode: 'nonce',
    directives: { /* see below */ }
  }
}
```

**Directives** (verbatim from spec § CSP):
- `default-src: ['self']`
- `script-src: ['self']` (plus `'unsafe-eval'` only in dev — guard
  with `process.env.NODE_ENV !== 'production'`)
- `style-src: ['self', 'unsafe-inline']`
- `connect-src: ['self']` in production. **In dev**, also include
  `'ws:'` and `'wss:'` so Vite's HMR websocket can connect; gate
  the relaxation with the same `process.env.NODE_ENV !== 'production'`
  check used for `'unsafe-eval'`. Note `'self'` is sufficient at
  runtime; the browser does not directly contact `api.anthropic.com`
  in this architecture.
- `img-src: ['self', 'data:']`
- `font-src: ['self']`
- `frame-ancestors: ['none']`
- `base-uri: ['self']`
- `form-action: ['self']`

**Acceptance criteria**
- `bun --filter @url-cheat-sheet/web build` succeeds.
- `bun --filter @url-cheat-sheet/web preview` serves the app
  without any console CSP-violation errors in DevTools on the
  golden path (load URL, paste key, send message).
- A response header `content-security-policy` is present on the
  served HTML.
- A `script-src 'self'` directive blocks an injected
  `<script>alert(1)</script>` (manual test in DevTools: try to
  evaluate it via console — it executes from the privileged
  DevTools context, which is *not* a CSP bypass; the real test is
  whether a `<script>` tag inserted into the DOM via JS is
  blocked. Use `document.body.appendChild(Object.assign(document.createElement('script'), { textContent: 'alert(1)' }))`
  and confirm it does not execute).

**Library calls**
- SvelteKit's `kit.csp` config option (documented in SvelteKit
  configuration reference).

**Test scenarios**
- No automated test; manual verification in Task 7.

**Steps**
- [ ] **6.1** Open `svelte.config.js`. Add the `csp` block with
      production directives.
- [ ] **6.2** Wrap the `script-src` value to include `'unsafe-eval'`
      only when `process.env.NODE_ENV !== 'production'`.
- [ ] **6.3** Run: `bun --filter @url-cheat-sheet/web build`.
      Expected: build succeeds.
- [ ] **6.4** Run: `bun --filter @url-cheat-sheet/web preview`.
      Open the served URL in a browser. Open DevTools Console; the
      golden path (load URL, paste key in drawer, send a message)
      runs with zero CSP errors.
- [ ] **6.5** Commit. Message: `feat(web): strict CSP via nonce mode`.

---

## Task 7 — Manual end-to-end smoke

**Files**
- None (verification step).

**Pre-flight**
- No `.env` file required for this task — the whole point is that
  the deployed app does not need an operator key. **Do not create
  or modify `.env`** (project rule from CLAUDE.md).
- You will need a real `sk-ant-...` key to paste in. If the user
  has not supplied one, **stop and ask**. This is a valid stop
  point.

**Acceptance criteria** (each is a manual checkbox)

- [ ] **7.1** From the worktree root: `bun --filter @url-cheat-sheet/web build && bun --filter @url-cheat-sheet/web preview`. App serves.
- [ ] **7.2** With no key set: the composer is disabled and the
      gear icon is visible.
- [ ] **7.3** Click the gear, paste a known-good `sk-ant-...` key,
      Save. The saved view shows the last-4 chip; composer enables.
- [ ] **7.4** Paste a URL into the URL field; load the page;
      confirm extract succeeds. (Existing flow, unchanged.)
- [ ] **7.5** Send a chat message. The agent streams a response.
      The browser DevTools Network tab shows `POST /api/chat`
      with the key in the request body (this is expected — it's
      the architecture). The response stream completes.
- [ ] **7.6** Open DevTools Console. Confirm no CSP violation
      messages on the golden path.
- [ ] **7.7** Hard-reload the page. The saved view is gone;
      `apiKey === null`; composer disabled. **In-memory only is
      verified.**
- [ ] **7.8** Re-enter the key. Click **Forget key**. Confirm
      composer disables, last-4 chip disappears.
- [ ] **7.9** Re-enter the key. Open a new tab to the same URL.
      Confirm the new tab has NO key set (no cross-tab leak via
      storage).
- [ ] **7.10** With a **wrong** key (e.g., `sk-ant-totally-invalid`):
      send a message. The error response does **not** echo the key.
      Network tab confirms response body contains no `sk-ant-`
      substring.
- [ ] **7.11** **Build-output runtime identifier check.** After
      `bun --filter @url-cheat-sheet/web build`, run
      `rg -n 'runtime' apps/web/.vercel/output/functions/*.func/.vc-config.json`.
      Confirm the value matches what ADR 0001 specifies. If the
      adapter has silently switched, catch it here, not in
      production.
- [ ] **7.12** **Mid-stream exception leakage.** Temporarily wire
      a throw inside a `streamText` `onError` callback (or a tool's
      `execute`) that includes a fake `sk-ant-leaktest` substring.
      Send a chat message. Confirm the client-visible error part
      does **not** contain the substring (the `onError` override
      from Task 2 returns the fixed `'Upstream provider error'`
      string regardless of the underlying error). Revert the
      temporary throw.
- [ ] **7.13** **Full agent-loop streaming completion.** Trigger
      a chat turn that exercises the 10-step agent loop (a
      complex question on a long document). Confirm the stream
      completes within Vercel's max-duration. If it truncates,
      file a follow-up `bd` issue for `export const config = { maxDuration: ... }`
      or for lowering `stepCountIs`; do **not** silently raise
      the cap during this task.
- [ ] **7.14** **Abort propagation.** Start a chat turn, then
      close the browser tab while the response is streaming.
      Confirm in Vercel logs (or local preview console) that the
      function exits early — not after a timeout. The
      `AbortSignal` plumbing from Task 2 is what makes this work.

**Steps**
- [ ] **7.15** Run through 7.1–7.14. Note any failures.
- [ ] **7.16** If all pass, no commit (verification only).
- [ ] **7.17** If any fail, file as a follow-up `bd` issue
      (`bd create --type=bug --priority=2`) referencing the
      smoke-test step that failed. Do **not** silently fix during
      this task — the failure may indicate a real spec gap.

---

## Definition of done

- All seven tasks' acceptance criteria pass.
- `bun --filter @url-cheat-sheet/web check` clean.
- `bun test` from repo root clean.
- Production build succeeds.
- Manual smoke test 7.1–7.14 all green.
- The string `process.env['ANTHROPIC_API_KEY']` does not appear
  anywhere under `apps/web/src/` or `apps/web/tests/` (verify:
  `rg -n "ANTHROPIC_API_KEY" apps/web/`).
- `docs/specs/2026-05-20-byo-anthropic-key.md` is referenced from
  the merged PR's body.

---

## Out of scope for this plan

- Task `ucs-14v` (server-side payload size guard) — backlog,
  shipped separately after we have baseline usage data.
- Multi-key / workspace / OAuth flows — Anthropic does not offer
  these for API keys; nothing for us to implement.
- Per-request cost meters, idle-timeout forgetting, hash-of-key
  displays — explicitly out of scope per spec § Non-goals.
