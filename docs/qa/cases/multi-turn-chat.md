---
feature: multi-turn-chat
bd: ucs-3bh
authored: 2026-05-27
authored-by: qa-team
---

# QA case — Multi-turn chat (ucs-3bh)

**Feature:** Verify the multi-turn chat history fix in `packages/agent/src/agent.ts`
(`convertToModelMessages(messages, { ignoreIncompleteToolCalls: true })`)
prevents `AI_MissingToolResultsError` on consecutive turns against `/api/chat`.

**bd issue:** `ucs-3bh`
**PR:** https://github.com/LissaGreense/URL-Cheat-Sheet/pull/131
**Authored:** 2026-05-27 by qa-team.

## Pre-flight

- Worktree: `/Users/sara/Projects/wt-ucs-3bh` on branch
  `feat/ucs-3bh-multiturn-tool-results`.
- `.env` symlinked from repo root; `ANTHROPIC_API_KEY` set.
- Preview: `bun --filter @url-cheat-sheet/web dev` (local).
- Browser: `claude-in-chrome` MCP.
- Test URL: `https://www.rfc-editor.org/rfc/rfc2324` (stable; small;
  well-known content — HTCPCP teapot RFC).

## Case schema (qaCaseSchema)

```yaml
name: multi-turn-chat
setup:
  - "Confirm ANTHROPIC_API_KEY present in repo-root .env"
  - "Start dev server: bun --filter @url-cheat-sheet/web dev"
  - "Tail server log: /tmp/ucs-3bh-dev.log"
steps:
  - { action: navigate, target: "/" }
  - { action: click, target: "[data-testid=settings-gear]" }
  - { action: type, target: "#byo-key-input", value: "<ANTHROPIC_API_KEY>" }
  - { action: click, target: "form.drawer--entry button.drawer__save" }
  - { action: click, target: "[data-testid=settings-drawer-close]" }
  - { action: type, target: "input.idle-input", value: "https://www.rfc-editor.org/rfc/rfc2324" }
  - { action: click, target: "button.idle-submit" }
  - { action: wait, value: "ready state visible (composer rendered)" }
  - { action: type, target: "input.composer__input", value: "what is the main topic?" }
  - { action: click, target: "button.composer__submit" }
  - { action: wait, value: "assistant response complete (composer re-enabled)" }
  - { action: type, target: "input.composer__input", value: "what else does it cover?" }
  - { action: click, target: "button.composer__submit" }
  - { action: wait, value: "assistant response complete" }
  - { action: type, target: "input.composer__input", value: "anything else important?" }
  - { action: click, target: "button.composer__submit" }
  - { action: wait, value: "assistant response complete" }
assertions:
  - "All 3 assistant responses render without error overlay"
  - "Server log grep 'AI_MissingToolResultsError' returns 0 occurrences"
  - "Browser console has no Error: lines originating from /api/chat"
  - "Each /api/chat POST returns 200"
  - "Each turn completes within 30s"
dataDependencies:
  - "ANTHROPIC_API_KEY (.env, user-managed)"
  - "https://www.rfc-editor.org/rfc/rfc2324 (public, stable)"
```

## Steps (narrative)

1. **Bring up dev server** and confirm Local URL printed in log.
2. **Open a new browser tab** to the dev URL.
3. **Set the BYO Anthropic key** via the settings drawer (gear icon →
   paste key → Save → close drawer).
4. **Paste URL** into the idle-state input.
5. **Submit** with the INGEST button; wait for ready-state composer to
   render (cinematic transition completes ~1.6s).
6. **Turn 1:** type `what is the main topic?` → SEND → wait for stream
   to finish (composer input becomes enabled again).
7. **Turn 2:** type `what else does it cover?` → SEND → wait for stream.
8. **Turn 3:** type `anything else important?` → SEND → wait for stream.
9. **Verify** server stdout for `AI_MissingToolResultsError` (must be 0).
10. **Verify** browser console for `Error:` lines originating from
    `/api/chat` (must be 0).

## Assertions (verbose)

1. All 3 assistant responses complete (no truncation, no error overlay).
2. Server stdout contains **zero** `AI_MissingToolResultsError` lines.
3. Browser console has no `Error:` lines from `/api/chat`.
4. Each `/api/chat` POST returns HTTP 200.
5. Each response renders within 30s of submission.

## Defect filing

Per project rule, qa-team never fixes. For any failed assertion file:

```bash
bd create --title "QA defect: <one-line>" --type=bug --priority=2
bd dep add <defect-id> ucs-3bh
```
