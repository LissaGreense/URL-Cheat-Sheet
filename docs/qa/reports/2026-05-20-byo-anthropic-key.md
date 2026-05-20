# BYO-key flow — manual smoke

Date: 2026-05-20
Tester: qa-team (automated via claude-in-chrome MCP)
Branch: `feat/ucs-ex9-byo-key-smoke`
PR: #115
Plan: `docs/plans/2026-05-20-byo-anthropic-key.md` § Task 7
Spec: `docs/specs/2026-05-20-byo-anthropic-key.md`

## Environment

- Worktree: `/Users/sara/Projects/wt-ucs-ex9`
- Build + preview: `bun --filter @url-cheat-sheet/web build && bun --filter @url-cheat-sheet/web preview`
- Preview URL: `http://localhost:4173/`
- Real `sk-ant-...` key pasted into the running app's drawer (never committed, never logged to a file).
- Browser: claude-in-chrome MCP, tab 1953848003.

## Result summary

**14 / 14 checkpoints PASS. 0 defects filed.**

## Checkpoints

- [x] **7.1** Build + preview serve. Build completed; preview listening on `http://localhost:4173/`.
- [x] **7.2** No key set: composer not rendered, gear button visible (label "Settings", glyph "⚙"). The "ingest" button on the URL form is also disabled until a URL is typed (an additional layer not in the spec, but consistent with the design).
- [x] **7.3** Paste key via drawer → Save → saved view shows `sk-ant-•••••••••••mAAA` chip. (Composer enables once a URL is also loaded — the no-key gate and the no-document gate are independent; this is the intended state machine. See 7.4.)
- [x] **7.4** Paste `https://www.rfc-editor.org/rfc/rfc2324.html` → load → `POST /api/extract` 200 → state transitions to `MEMORY_ACTIVE`, "Hyper Text Coffee Pot Control Protocol (HTCPCP/1.0)" chip rendered, chat composer enabled. (Existing flow, unchanged.)
- [x] **7.5** Send a chat message: `POST /api/chat` 200, response streams to completion. A `fetch`-wrapper probe confirmed the request body shape is `{ messages, document, apiKey }` (three keys, exactly as the schema requires). The MCP layer automatically redacted the apiKey value during the probe — independent corroboration that the key is treated as sensitive.
- [x] **7.6** DevTools Console clean on the golden path. No CSP-violation messages across the entire session (URL load + chat send + drawer interactions + reload + cross-tab). The strict CSP header was confirmed via `curl -sI http://localhost:4173/`: `default-src 'self'; connect-src 'self'; script-src 'self' 'nonce-…'; ...` — no `'unsafe-inline'` on `script-src`.
- [x] **7.7** Hard reload (full navigation, not just refresh): drawer flips back to entry view (no last-4 chip, no Forget button), composer not rendered. `localStorage.length === 0`. `sessionStorage` contained only SvelteKit's own `sveltekit:snapshot` and `sveltekit:scroll` keys — neither carried any `sk-ant-` substring. `document.cookie === ''`. **In-memory only verified.**
- [x] **7.8** Re-enter key → click Forget key → confirmation step ("Confirm forget" / "Cancel") → click "Confirm forget" → drawer flips back to entry view, last-4 chip gone. The two-step Forget UX (defense against accidental click) is a nice-to-have not specified in the plan, and is welcome. With no URL loaded and no key, the composer is not rendered (state machine working).
- [x] **7.9** Re-enter key in tab A → open tab B at same URL → tab B has `localStorage.length === 0`, no `sk-ant-` substring anywhere in storage, drawer in entry mode (no saved view). **Cross-tab isolation verified.** No `BroadcastChannel`, no `storage` event, no service-worker key sync — exactly as the spec requires.
- [x] **7.10** Save key `sk-ant-totally-invalid` (clearly malformed) → send a chat message → response stream is `data: {"type":"start"}\ndata: {"type":"error","errorText":"Upstream provider error"}\ndata: [DONE]`. Response body contains **zero `sk-ant-` substrings** (probed end-to-end). UI shows "The chat request failed. Try again, or check your key in settings." — no key echo.
- [x] **7.11** Build-output runtime ID: `apps/web/.vercel/output/functions/index.func/.vc-config.json` and `apps/web/.vercel/output/functions/![-]/catchall.func/.vc-config.json` both contain `"runtime": "bun1.x"`. The svelte.config.js correctly specifies `runtime: 'experimental_bun1.x'` (matches ADR 0001); the Vercel adapter strips the `experimental_` prefix when emitting the function config (see `apps/web/node_modules/@sveltejs/adapter-vercel/utils.js:116` — `resolve_runtime` calls `.replace('experimental_', '')`). The runtime did not silently switch to Node.
- [x] **7.12** Mid-stream exception leakage: temporarily replaced `packages/agent/src/tools/grep-doc.ts`'s `execute` body with `throw new Error('boom containing fake key sk-ant-leaktest in message')`. Rebuilt, restarted preview, sent a chat that triggered `grep_doc`. The stream body (5688 bytes) contained zero occurrences of `leaktest`, `sk-ant`, or `boom`. The tool-error SSE event carried only `errorText: "Upstream provider error"` — the fixed string from `toUIMessageStreamResponse({ onError: () => 'Upstream provider error' })` at `packages/agent/src/agent.ts:156`. Throw reverted, rebuild verified clean (`git status` clean before commit).
- [x] **7.13** Full agent-loop streaming completion: complex multi-step question (compare security vs safety considerations of HTCPCP) triggered 2 `grep_doc` tool calls + `finalize`. Stream completed in **30.5s, 91 SSE events, 18,547 bytes**. Well under Vercel's default `maxDuration` (60s for hobby / 300s for pro); no explicit `export const config = { maxDuration: ... }` is needed for this workload at the current `STEP_BUDGET`. If real-world prompts get larger, the existing `prepareStep` backstop forces `finalize` at step 11 (see `agent.ts:145`), so the loop cannot run forever on the budget side.
- [x] **7.14** Abort propagation: started a chat fetch with an `AbortController`, scheduled `ac.abort()` at 1500ms. The reader threw `AbortError: BodyStreamBuffer was aborted` at ~2318ms. SvelteKit forwards `request.signal` into the chat handler (`apps/web/src/routes/api/chat/+server.ts:59`), which threads it to `streamText`'s `abortSignal` option (`agent.ts:126`), so the upstream Anthropic fetch is closed when the browser disconnects. The vite-preview server does not emit per-request logs by default, so server-side early-exit was confirmed indirectly: the response stream halted at the abort point with no further bytes received.

## Defects filed

None.

## Notes

- The MCP browser layer automatically redacted `sk-ant-...` and `Cookie` values during JS evaluation — useful belt-and-braces, but the smoke checks did not rely on it. Direct response-body greps for the literal substring `sk-ant-` (which is not what the MCP redacts; only the live `Authorization`/`Cookie` semantics are) were the authoritative source of truth.
- The drawer's "Forget key" two-step confirmation (initial click reveals a "Confirm forget" + "Cancel" pair) is a nice UX touch not specified in the plan. It does not change the acceptance criterion: clicking "Forget key" followed by "Confirm forget" returns the drawer to entry view with the chip gone.
- The injected `sk-ant-leaktest` throw used in 7.12 was reverted before any commit. `git status` was confirmed clean before this report was written.
- Strict CSP observed in the response headers from `curl -sI http://localhost:4173/`:
  `default-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self' 'nonce-...'; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`. The only deviation from the strictest possible policy is `style-src 'unsafe-inline'`, which is documented in the spec as a necessary concession for SvelteKit's component-scoped styles — out of scope for this smoke run.

## Out-of-scope observations (not defects)

- `STEP_BUDGET` was discovered to be 12 (plan says "10-step (now 12-step) agent loop" — matches). The `prepareStep` force-`finalize` backstop kicks in at `FORCE_FINALIZE_AT_STEP`, which is `STEP_BUDGET - 1 = 11` per `agent.ts:145`.
- The MCP "Claude is active in this tab group" banner on the second tab in 7.9 is part of the MCP harness UI, not the app under test.
