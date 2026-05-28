# QA Report — cross-fade-transition — 2026-05-28

**Case:** ../cases/cross-fade-transition.md
**Issue:** ucs-52o
**PR:** https://github.com/LissaGreense/URL-Cheat-Sheet/pull/141
**Preview:** local vite dev server (worktree feat/ucs-52o-cross-fade-transition), viewport innerHeight 957px
**Run by:** orchestrator (gate:qa)
**Test URL:** https://datatracker.ietf.org/doc/html/rfc2324

## Results

| # | Assertion | Observed | Pass/Fail |
|---|---|---|---|
| 1 | Cross-fade overlaps (no stacking / no 2× height) | 11 samples with BOTH states present; `scrollHeight` 957 throughout (was 1914 before grid-stack fix) | ✅ |
| 2 | Transition reaches ready | `reachedReady: true` | ✅ |
| 3 | Long conversation still scrolls | 3000px content → scrollHeight 3379 > 957, scrolls | ✅ |
| 4 | Empty ready fits one viewport | scrollHeight 957 == innerHeight | ✅ |
| 5 | No console errors | none | ✅ |

## Notes
First QA pass caught a regression: the naive `transition:fade` on two block-level
branches stacked them in normal flow during the ~250ms fade, doubling document
height to 1914px (scrollbar flash + content slide). Fixed by wrapping the state
render region in a single-cell CSS grid (`.state-stack`, `grid-template-areas:
'stack'`) with every branch root at `grid-area: stack`, so the two transitioning
elements overlap in the same cell. Re-verified above: both states coexist (11
samples) at a steady 957px. The GSAP overlay (and its rAF-completion/duplication
machinery) is gone entirely — no hang or duplication possible.

## Console errors
- None.

## Failed network requests
- None (POST /api/extract → 200).

## Screenshots
- mid-fade frame (ready fading in over extracting, single viewport, no scrollbar) and final ready state: captured in QA session.

## Defects filed
- None remaining — the one regression found (stacking) was fixed in-loop (commit 2c06eb0) and re-verified.
