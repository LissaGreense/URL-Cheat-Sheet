# QA Report — empty-state-scroll — 2026-05-28

**Case:** ../cases/empty-state-scroll.md
**Issue:** ucs-wj9
**PR:** https://github.com/LissaGreense/URL-Cheat-Sheet/pull/139
**Preview:** local vite dev server (worktree feat/ucs-wj9-empty-state-scroll), viewport innerHeight 957px
**Run by:** orchestrator (gate:qa)

## Results

| # | Assertion | scrollHeight − innerHeight | Pass/Fail |
|---|---|---|---|
| 1 | idle: no phantom scroll | 0 | ✅ |
| 2 | extracting: no phantom scroll | 0 | ✅ |
| 3 | error: no phantom scroll | 0 | ✅ |
| 4 | flagged: no phantom scroll | 0 | ✅ |
| 5 | ready (empty thread): no phantom scroll | 0 | ✅ |
| 6 | ready + 2000px content: real scrolling preserved | +1422 (scrollHeight 2379 > 957) | ✅ |

Baseline before fix (live prod, idle): scrollHeight 1085 vs innerHeight 957 → 128px phantom overflow. After fix: 0 across all five empty states.

## Console errors
- None.

## Failed network requests
- None (state-override paths make no API calls).

## Screenshots
- ready-state (empty, composer pinned bottom, no scroll): captured in QA session.

## Defects filed
- None — all assertions pass.
