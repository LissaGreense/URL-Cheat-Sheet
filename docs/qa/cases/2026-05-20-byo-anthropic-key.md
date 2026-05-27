---
feature: byo-anthropic-key
bd: ucs-h62
authored: 2026-05-27
authored-by: qa-team
---

# QA case — BYO Anthropic Key (ucs-h62)

**Feature:** End-to-end manual smoke for the per-request user-supplied
Anthropic API key. Verifies the operator key has been removed from
`process.env`, the BYO key flows browser → `/api/chat` → Anthropic
transit-only, in-memory only (no persistence), no leakage in
errors / logs / responses, plus CSP, build-output runtime, abort
propagation, and the full agent-loop completion under Vercel's max
duration.

**Spec:** `docs/specs/2026-05-20-byo-anthropic-key.md`
**Plan:** `docs/plans/2026-05-20-byo-anthropic-key.md` — Task 7
**bd issue:** `ucs-h62`
**Authored:** 2026-05-27 by qa-team.

## Pre-flight

- Worktree: any worktree synced to a branch that has Tasks 1–6
  landed (the orchestrator handles this; QA runs against the preview
  deployment, not against local source).
- A real `sk-ant-...` Anthropic key is required to paste into the
  drawer. If the user has not supplied one, **stop and ask** — this
  is a valid stop point. **Do not create or modify `.env`.**
- Preview surface: deployed Vercel preview URL (preferred). Local
  fallback: `bun --filter @url-cheat-sheet/web build &&
  bun --filter @url-cheat-sheet/web preview`.
- Browser: `claude-in-chrome` MCP (or manual Chromium with DevTools
  open: Console + Network tabs visible).
- Test URL for the extract flow: a stable, public, small-payload URL
  (e.g., `https://www.rfc-editor.org/rfc/rfc2324`).

## Case schema (qaCaseSchema)

```yaml
name: byo-anthropic-key
setup:
  - "Confirm Tasks 1-6 of docs/plans/2026-05-20-byo-anthropic-key.md are landed on the branch under test"
  - "Have a valid sk-ant-... key on hand (user-supplied); do NOT create or modify .env"
  - "Open the preview URL (or run: bun --filter @url-cheat-sheet/web build && bun --filter @url-cheat-sheet/web preview) and open browser DevTools (Console + Network)"
  - "Have a wrong/invalid key value ready for the error-path step (e.g. sk-ant-totally-invalid)"
  - "From the worktree root: bun --filter @url-cheat-sheet/web build completed; .vercel/output is present (needed for step 7.11)"
steps:
  # 7.1 App serves
  - { action: navigate, target: "/", assertion: "App serves; page loads without error overlay" }
  # 7.2 No key set: composer disabled, gear icon visible
  - { action: assert, target: "[data-testid=settings-gear]", assertion: "Settings gear icon visible in top-right" }
  - { action: assert, target: "composer input[type=text]", assertion: "Composer input is disabled (no key set) and placeholder reads 'Add your Anthropic API key in settings to start chatting'" }
  # 7.3 Open gear, paste key, Save
  - { action: click, target: "[data-testid=settings-gear]" }
  - { action: type, target: "[data-testid=byo-key-input]", value: "<VALID_SK_ANT_KEY>" }
  - { action: click, target: "[data-testid=byo-key-save]" }
  - { action: assert, assertion: "Saved view renders a chip masked as sk-ant-***...<last4>; composer is now enabled" }
  # 7.4 Paste URL, load page, extract succeeds (existing flow unchanged)
  - { action: type, target: "input.idle-input", value: "https://www.rfc-editor.org/rfc/rfc2324" }
  - { action: click, target: "button.idle-submit" }
  - { action: wait, value: "ready state visible (composer rendered, document loaded)", assertion: "Extract succeeds; ready state shows MEMORY_ACTIVE chip" }
  # 7.5 Send a chat message; agent streams; Network shows apiKey in POST body
  - { action: type, target: "input.composer__input", value: "what is the main topic?" }
  - { action: click, target: "button.composer__submit" }
  - { action: wait, value: "assistant response stream completes (composer re-enabled)", assertion: "POST /api/chat request body contains apiKey field equal to the key entered in step 7.3; response is a 200 streamed body; stream completes" }
  # 7.6 No CSP violations on the golden path
  - { action: assert, assertion: "DevTools Console has zero Content-Security-Policy violation messages across steps 7.1 through 7.5" }
  # 7.7 Hard-reload: key is gone; composer disabled (in-memory only)
  - { action: navigate, target: "/", value: "hard reload (Cmd+Shift+R / Ctrl+Shift+R) to bust any bfcache/sw cache", assertion: "After hard reload, apiKey is null: saved-view chip is gone, composer is disabled, gear visible -- in-memory-only is verified" }
  # 7.8 Re-enter key, click Forget key; composer disables
  - { action: click, target: "[data-testid=settings-gear]" }
  - { action: type, target: "[data-testid=byo-key-input]", value: "<VALID_SK_ANT_KEY>" }
  - { action: click, target: "[data-testid=byo-key-save]" }
  - { action: click, target: "[data-testid=byo-key-forget]" }
  - { action: assert, assertion: "After Forget key: last-4 chip disappears, composer disables, drawer returns to Entry view" }
  # 7.9 New tab to same URL has no key (no cross-tab leak via storage)
  - { action: click, target: "[data-testid=settings-gear]" }
  - { action: type, target: "[data-testid=byo-key-input]", value: "<VALID_SK_ANT_KEY>" }
  - { action: click, target: "[data-testid=byo-key-save]" }
  - { action: navigate, target: "<same preview URL>", value: "open in a brand-new tab (Ctrl+T then paste URL); leave the original tab open", assertion: "The new tab shows apiKey === null (composer disabled, no chip); no cross-tab leak via localStorage/sessionStorage/cookies" }
  # 7.10 Wrong key: error response does not echo the key
  - { action: click, target: "[data-testid=settings-gear]" }
  - { action: click, target: "[data-testid=byo-key-forget]", value: "clear current key before re-entering the invalid one" }
  - { action: type, target: "[data-testid=byo-key-input]", value: "sk-ant-totally-invalid" }
  - { action: click, target: "[data-testid=byo-key-save]" }
  - { action: type, target: "input.composer__input", value: "what is the main topic?" }
  - { action: click, target: "button.composer__submit" }
  - { action: wait, value: "POST /api/chat completes with an error response (expected 401 'API key rejected by provider')", assertion: "Response body contains zero occurrences of 'sk-ant-' substring; response body does not contain the key 'sk-ant-totally-invalid' verbatim; client surfaces the 'API key rejected' UX (drawer re-opens, apiKey cleared, input focused) per plan Task 5 client-side error handling" }
  # 7.11 Build-output runtime identifier check
  - { action: assert, target: "apps/web/.vercel/output/functions/*.func/.vc-config.json", value: "rg -n 'runtime' apps/web/.vercel/output/functions/*.func/.vc-config.json", assertion: "runtime value matches ADR 0001 specification (experimental_bun1.x); if the adapter has silently switched runtimes, this catches it before production" }
  # 7.12 Mid-stream exception leakage
  - { action: assert, value: "Temporarily wire a throw inside streamText's onError callback (or a tool's execute) that includes a fake 'sk-ant-leaktest' substring. Send a chat message. Read the client-visible error part. Revert the temporary throw afterward.", assertion: "Client-visible error part does NOT contain 'sk-ant-leaktest'; the Task-2 onError override returns the fixed 'Upstream provider error' string regardless of the underlying error. Temporary throw is reverted before continuing." }
  # 7.13 Full agent-loop streaming completion
  - { action: type, target: "input.composer__input", value: "Summarize every section of this document in three paragraphs each, citing exact line numbers for each claim." }
  - { action: click, target: "button.composer__submit" }
  - { action: wait, value: "agent loop runs to completion (multi-step grep_doc + finalize); stream emits a final assistant turn", assertion: "Stream completes within Vercel's max-duration without truncation; no AI_MissingToolResultsError in server logs; if it truncates, file a follow-up bd issue for export const config = { maxDuration: ... } or for lowering stepCountIs -- do NOT silently raise the cap" }
  # 7.14 Abort propagation
  - { action: type, target: "input.composer__input", value: "Summarize the document in 5 paragraphs." }
  - { action: click, target: "button.composer__submit" }
  - { action: wait, value: "stream has started (first chunk visible) but is not yet complete" }
  - { action: click, target: "<close-tab affordance>", value: "close the browser tab mid-stream (Cmd+W / Ctrl+W) -- standard user gesture for abort propagation" }
  - { action: assert, assertion: "Vercel function logs (or local preview console) show the function exited early -- not after a timeout. The Task-2 AbortSignal plumbing is what makes this work." }
assertions:
  - "Step 7.1: app serves on the preview URL with no overlay or fatal error"
  - "Step 7.2: with apiKey === null, the composer is disabled and the gear icon is visible; placeholder reads the BYO prompt"
  - "Step 7.3: pasting a valid sk-ant-... key and Saving switches to the Saved view with a masked last-4 chip and enables the composer"
  - "Step 7.4: existing URL-extract flow still works (regression check)"
  - "Step 7.5: POST /api/chat includes apiKey in the request body and returns a 200 streamed response that completes"
  - "Step 7.6: zero CSP violations in DevTools Console across the golden path"
  - "Step 7.7: hard reload returns to apiKey === null (composer disabled, no chip) -- in-memory only is verified"
  - "Step 7.8: Forget key disables the composer, removes the chip, and returns the drawer to Entry view"
  - "Step 7.9: a new browser tab to the same URL shows apiKey === null -- no cross-tab leak via storage"
  - "Step 7.10: a wrong key produces an error response whose body contains zero occurrences of any 'sk-ant-' substring AND does not contain the invalid key verbatim; client routes to the 401 UX (drawer re-opens, focus on key input)"
  - "Step 7.11: build-output runtime in apps/web/.vercel/output/functions/*.func/.vc-config.json matches ADR 0001 (experimental_bun1.x)"
  - "Step 7.12: mid-stream exception with a planted 'sk-ant-leaktest' substring does NOT leak to the client; client sees only 'Upstream provider error'"
  - "Step 7.13: a complex agent-loop turn completes within Vercel's max-duration without truncation; no AI_MissingToolResultsError"
  - "Step 7.14: closing the tab mid-stream causes the server function to exit early (not on timeout) -- AbortSignal propagation works end-to-end"
  - "Cross-cutting: no error-response body, no console.* log, and no network response anywhere in the session contains a literal 'sk-ant-' substring originating from the user's key (the masked chip's last-4 display is allowed because it appears in the rendered DOM, not in responses or logs)"
dataDependencies:
  - "User-supplied sk-ant-... Anthropic API key (NOT from .env; pasted into the drawer at runtime)"
  - "Wrong/invalid key string for the error-path step (e.g. sk-ant-totally-invalid)"
  - "Stable public test URL for extract: https://www.rfc-editor.org/rfc/rfc2324"
  - "apps/web/.vercel/output (produced by `bun --filter @url-cheat-sheet/web build`) for the runtime-identifier check in step 7.11"
  - "Preview deployment URL (preferred) OR local `bun --filter @url-cheat-sheet/web preview` server"
```

## Steps (narrative)

The 14 checkpoints below mirror Task 7 of
`docs/plans/2026-05-20-byo-anthropic-key.md` 1:1.

1. **7.1 App serves.** Run the preview build (or visit the deploy);
   verify the page loads.
2. **7.2 No key set.** Confirm the composer is disabled with the BYO
   prompt placeholder and the gear icon is visible.
3. **7.3 Paste-and-Save flow.** Open the drawer, paste a real
   `sk-ant-...` key, Save. Confirm Saved-view chip + composer enabled.
4. **7.4 URL extract (regression).** Paste a public URL into the idle
   input; submit; the extract pipeline still reaches `ready` state.
5. **7.5 Chat with valid key.** Send a message; verify `POST /api/chat`
   contains `apiKey` in the body and that the response streams to
   completion.
6. **7.6 CSP clean.** DevTools Console shows zero CSP-violation
   messages on the golden path.
7. **7.7 In-memory only.** Hard-reload — the key is gone.
8. **7.8 Forget key.** Re-enter and explicitly forget; composer
   disables, chip removed.
9. **7.9 No cross-tab leak.** Open a new tab to the same URL; it
   starts with no key set.
10. **7.10 Wrong key, no leak.** Save an invalid key, send a message,
    inspect the error response — no `sk-ant-` substring anywhere in
    the response body.
11. **7.11 Runtime identifier.** Inspect
    `apps/web/.vercel/output/functions/*.func/.vc-config.json` and
    confirm runtime matches ADR 0001 (`experimental_bun1.x`).
12. **7.12 Mid-stream exception leakage.** Temporarily plant an error
    containing `sk-ant-leaktest` inside `onError`; verify the
    client-visible error part returns only the fixed
    `Upstream provider error` string. **Revert the planted throw
    before continuing.**
13. **7.13 Full agent-loop completion.** Send a complex multi-step
    question; verify the stream completes within
    Vercel's max-duration; no truncation, no
    `AI_MissingToolResultsError`.
14. **7.14 Abort propagation.** Close the tab mid-stream; confirm the
    server function exits early, not on timeout.

## Defect filing

Per project rule (`qa-standard` skill), qa-team **never fixes**. For
any failed assertion file:

```bash
bd create --title "[qa-defect] BYO key: <short>" --type bug --priority 2 \
  --description "..." --labels "gate:qa"
bd dep add ucs-h62 <new-issue-id>
```

## Plan ambiguities (resolved or flagged)

The following decisions were made while translating Task 7 checkpoints
into qaCaseSchema-conforming steps. None invent new behavior; they
choose between defensible literal readings.

- **DOM selectors.** Task 7 doesn't pin selectors. Used the same
  `[data-testid=...]` convention as `multi-turn-chat.md` plus the
  existing class-based selectors (`input.idle-input`, `button.idle-submit`,
  `input.composer__input`, `button.composer__submit`). The qa-runner
  reconciles any drift; if a selector is wrong the runner files a
  defect rather than the case authoring it incorrectly.
- **Step 7.10 (wrong-key error).** The plan says "the error response
  does not echo the key" and "Network tab confirms response body
  contains no `sk-ant-` substring." Captured both the literal
  substring assertion AND a stronger "no verbatim invalid-key value"
  assertion; the runner can downgrade if the literal check is the
  only spec-mandated one.
- **Step 7.11 (runtime check).** The plan's `rg` invocation is a
  shell-side check, not a browser step. Encoded as an `assert` step
  with `target` = the glob and `value` = the literal command — the
  runner executes it out-of-band.
- **Step 7.12 (mid-stream leakage).** This requires temporarily
  editing source to plant a known leak string. The assertion is
  framed so a single browser observation is enough to verify; the
  source-edit + revert is captured in the step's `value` narrative.
  Flagging this as the step most likely to require the runner to
  pause and ask the orchestrator before proceeding.
- **Step 7.14 (abort propagation).** The plan says "confirm in Vercel
  logs (or local preview console) that the function exits early." Made
  the assertion check both surfaces; the runner uses whichever
  applies to the preview environment under test.
- **"`<VALID_SK_ANT_KEY>`" / "`<same preview URL>`" placeholders.**
  Used angle-bracket placeholders for runtime-supplied values (the
  user's real key, the actual preview URL). The runner substitutes
  these at execution time; recording them as placeholders rather than
  baking them in keeps the case file safe to commit.
