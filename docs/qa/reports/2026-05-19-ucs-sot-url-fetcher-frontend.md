# QA Report — URL fetcher frontend (ucs-sot) — 2026-05-19 (post-fix)

**PR:** #32
**Branch:** `feat/ucs-sot-url-fetcher-frontend-url-setup-confirmation-card-grounding-chip`
**Preview URL:** http://localhost:5173/ (local `vite dev`)
**Run by:** Claude (qa-standard skill) — post-fix gate:qa walkthrough after ucs-u47 SNI fix merged in.

## Environment

- Worktree: `/Users/sara/Projects/wt-ucs-sot`
- Dev server: `vite dev` launched from `apps/web` with `set -a; source ../../.env; set +a; bun run dev`.
  - Note: `bun --filter @url-cheat-sheet/web dev` runs child processes from `apps/web` and Bun loads `.env` from the child CWD, so the symlinked root `.env` isn't picked up by the filter spawn. Sourcing into the shell before `vite dev` is the working dev-env recipe.
- `.env` symlink confirmed: `/Users/sara/Projects/wt-ucs-sot/.env -> /Users/sara/Projects/URL-Cheat-Sheet/.env`; `ANTHROPIC_API_KEY` line present (not read).
- Sanity check on `/api/extract`: POST `rfc2324.html` → HTTP 200, JSON body with extracted text.
- Sanity check on `/api/chat`: POST with AI-SDK shape → HTTP 200, streaming `text-delta` events.
- Browser: claude-in-chrome MCP, tab 1953847989 on `http://localhost:5173/`.

## Results

| # | Scenario | URL | Expected | Observed | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Idle state | — | URL input + "Load page" button; no chat composer | `textbox "Page URL"` + `button "Load page"` rendered; no chat composer | PASS |
| 2 | Happy path | `https://www.rfc-editor.org/rfc/rfc2324.html` | extracting → ready, grounding chip with title; assistant cites `L<n>` | Transitioned to ready; chip read `Grounded in: Hyper Text Coffee Pot Control Protocol (HTCPCP/1.0)`; assistant replied with tool call `tool-grep_doc` and answer citing `L6` and `L20-21` | PASS |
| 3 | Change URL | (from ready) | clicking "change" resets to idle + empty chat history | Clicked `change`; page rendered idle hint "Paste a URL to start chatting about a page." with empty URL input and no message list | PASS |
| 4 | Flagged best-effort | `https://simonwillison.net/2023/Apr/14/worst-that-can-happen/` | flagged card → "Continue with this page" → ready | Flagged with `role-manipulation (severity 0.85)`; "Continue with this page" transitioned to ready with chip `Grounded in: Prompt injection: What's the worst that can happen?` | PASS |
| 5 | Error 404 | `https://www.rfc-editor.org/rfc/this-is-not-real-xyz.html` | extract-error with server-error message; "Try a different URL" → idle | Rendered `The page server returned an error.` (humanized `FETCH_HTTP_ERROR`); "Try a different URL" returned to idle | PASS |
| 6 | Blocked URL | `http://127.0.0.1/` | extract-error "That URL is not allowed." | Rendered `That URL is not allowed.` exactly | PASS |

## Frontend state machine — observations

All 5 states reachable and behaving as designed:
- `idle` → URL composer renders cleanly with the right hint.
- `extracting` → brief transient state, not observed visually (extraction returns fast on the sample URLs).
- `ready` → grounding chip shows document title, `change` button works, chat composer enabled, message list renders user + assistant messages with tool-call disclosure.
- `flagged` → severity-typed threat list rendered, both confirm and reset paths verified.
- `extract-error` → typed-error humanization works (`FETCH_HTTP_ERROR` and `FETCH_BLOCKED_URL` both verified); reset path works.

## Console errors

None observed.

## Network requests

| Method | URL | Status | Notes |
|---|---|---|---|
| POST | `/api/extract` | 200 | rfc2324.html — happy path |
| POST | `/api/extract` | 200 | simonwillison.net flagged page |
| POST | `/api/extract` | (HTTP error) | this-is-not-real-xyz.html — `FETCH_HTTP_ERROR` mapped |
| POST | `/api/extract` | 400 | 127.0.0.1 — `FETCH_BLOCKED_URL` (expected) |
| POST | `/api/chat` | 200 | streaming `start`/`text-delta`/`finish` events for HTCPCP question |

## Defects filed

None. All previously blocking issues (ucs-u47 SNI) resolved.

## Notes for follow-up

- The `bun --filter ... dev` env loading quirk (Bun reads `.env` from child CWD, not the orchestrating root) is a developer-experience papercut. Not a product defect — but worth a tiny note in the dev-setup docs so future contributors don't lose 10 minutes on `ANTHROPIC_API_KEY not set` from an apparently-correct symlink.
