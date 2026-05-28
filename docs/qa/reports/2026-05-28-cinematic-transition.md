# QA Report — cinematic-transition — 2026-05-28

**Case:** ../cases/cinematic-transition.md
**Issue:** ucs-apq
**PR:** https://github.com/LissaGreense/URL-Cheat-Sheet/pull/140
**Preview:** local vite dev server (worktree feat/ucs-apq-cinematic-transition)
**Run by:** orchestrator (gate:qa)
**Test URL:** https://datatracker.ietf.org/doc/html/rfc2324 (extracts successfully → triggers the ready transition)

## Results

| # | Assertion | Observed | Pass/Fail |
|---|---|---|---|
| 1 | Transition reaches ready, no hang on READING | `.ready-state` present, `.extracting-state` absent, `READING` count 0; reached within ~5s (was 20s+ hang) | ✅ |
| 2 | No duplication / no stacked layers | `extracting-bar` count 0, cinematic overlay absent in end state | ✅ |
| 3 | Greeting appears exactly once | greeting count 1 | ✅ |
| 4 | Ready fully rendered | composer present, memory chip shows "RFC 2324: Hyper Text Coffee Pot Control Protocol (HTCPCP/1.0)" | ✅ |
| 5 | No console errors | none | ✅ |

The completion under automated control (where rAF is throttled) exercises the new
bounded fallback path directly — previously this exact condition stranded the user
on READING; it now advances to ready. Mid-transition mutual-exclusivity is enforced
structurally (`{:else if renderState.kind === 'extracting' && !transitioning}`) and
covered by svelte-check + the unit suite; the end-state probe confirms no residual
duplication.

## Console errors
- None.

## Failed network requests
- None observed (POST /api/extract → 200).

## Screenshots
- ready-state after RFC extraction (clean, single greeting, composer pinned): captured in QA session.

## Defects filed
- None — all assertions pass.
