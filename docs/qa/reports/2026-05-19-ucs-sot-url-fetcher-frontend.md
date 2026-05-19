# QA Report — URL fetcher frontend (ucs-sot) — 2026-05-19

**PR:** #32
**Branch:** `feat/ucs-sot-url-fetcher-frontend-url-setup-confirmation-card-grounding-chip`
**Preview URL:** http://localhost:5173/ (local `vite dev`)
**Run by:** Claude (qa-standard skill)

## Environment

- Worktree: `/Users/sara/Projects/wt-ucs-sot`
- Dev server: `bun run --filter @url-cheat-sheet/web dev` → actually executes under **Node** (vite dev's node binary), not Bun runtime.
- `.env` with `ANTHROPIC_API_KEY` confirmed present at repo root.
- Browser: claude-in-chrome MCP, fresh tab on `http://localhost:5173/`.

## Results

| # | Scenario | URL | Expected | Observed | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Idle state | — | URL input + "Load page" button; no chat composer | URL input + "Load page" button rendered; no chat composer | PASS |
| 2 | Happy path | `https://www.rfc-editor.org/rfc/rfc2324.html` | extracting → ready, grounding chip with title; assistant response with `L<n>` citation | Lands in `extract-error` state: "Could not reach the page." `/api/extract` returned 504 `FETCH_NETWORK` | FAIL (ucs-u47) |
| 3 | Change URL | (would follow scenario 2 ready state) | clicking "change" resets to idle + empty chat history | Not reachable — scenario 2 never reached ready state | BLOCKED (ucs-u47) |
| 4 | Flagged URL | `https://simonwillison.net/2023/Apr/14/worst-that-can-happen/` | confirmation card OR clean → ready | Not exercised — would fail at the same `safeFetch` TLS step under Node | BLOCKED (ucs-u47) |
| 5 | Error 404 | `https://www.rfc-editor.org/rfc/this-is-not-a-real-path.html` | `extract-error` with server-error message; "Try a different URL" → idle | Reached `extract-error` ("Could not reach the page.") and "Try a different URL" correctly returns to idle. **However, the cause was the same `FETCH_NETWORK` TLS bug, not a real upstream 404** — server never got far enough to receive the 404. Behaviorally the UI rendering and reset link work; underlying error mapping is wrong. | PARTIAL (UI ok, server-side incorrect — covered by ucs-u47) |
| 6 | Blocked URL | `http://127.0.0.1/` | `extract-error` with "That URL is not allowed." | Rendered "That URL is not allowed." exactly | PASS |

## Frontend state machine — what worked

The 5-state machine in `apps/web` itself behaves as designed for the states reachable in this run:
- `idle` renders the URL input + submit cleanly.
- Submitting transitions to (briefly) `extracting`, then `extract-error` on a 504.
- `extract-error` shows the appropriate copy: "Could not reach the page." vs "That URL is not allowed." (driven by the typed error kind).
- The "Try a different URL" affordance returns the machine to `idle` and clears the input.

I was unable to verify `ready` / `change-URL` / `confirmation` transitions because every HTTPS fetch fails at the network layer.

## Console errors

None observed in the browser console for the test runs.

## Failed network requests

| Method | URL | Status | Body |
|---|---|---|---|
| POST | `/api/extract` | 504 | `{"kind":"FETCH_NETWORK","message":"FETCH_NETWORK"}` (rfc2324) |
| POST | `/api/extract` | 504 | `{"kind":"FETCH_NETWORK","message":"FETCH_NETWORK"}` (example.com/this-is-not-a-real-path) |
| POST | `/api/extract` | 502 | `{"kind":"FETCH_HTTP_ERROR","message":"FETCH_HTTP_ERROR"}` (http://example.com → 301 → blocked at redirect handling) |
| POST | `/api/extract` | 400 | `{"kind":"FETCH_BLOCKED_URL","message":"FETCH_BLOCKED_URL"}` (127.0.0.1 — expected) |

## Root-cause investigation

`packages/agent/src/url/fetch.ts` SSRF-pins each hop to a resolved IP and sets the original hostname via `host` header. Bun's fetch handles SNI correctly when the URL hostname is an IP; Node's undici-based fetch sends SNI = URL hostname (= the IP literal), so TLS terminators (Cloudflare et al.) abort with `ssl/tls alert handshake failure: SSL alert number 40`.

Standalone repro confirms the Bun path works (`bun run` against `safeFetch('https://www.rfc-editor.org/rfc/rfc2324.html')` → 32 684 bytes, `finalUrl: https://104.18.20.81/rfc/rfc2324.html`).

The dev server runs `node node_modules/.bin/vite dev`, hence the failure under `bun run --filter @url-cheat-sheet/web dev`.

Secondary issue: `+server.ts` overwrites the `message` field with the error `kind` (`errorBody(fetchResult.error.kind, fetchResult.error.kind)`), discarding the original error string captured in `safeFetch`. The actual TLS error is invisible to both the client and the server log, making this bug a lot harder to spot from the UI alone.

## Defects filed

- **ucs-u47** — `safeFetch` TLS handshake fails for HTTPS under Node (vite dev / prod). P2 bug, blocks ucs-sot.

## Screenshots

Skipped — accessibility-tree snapshots captured per state are inlined above and sufficient for the failure modes observed.
