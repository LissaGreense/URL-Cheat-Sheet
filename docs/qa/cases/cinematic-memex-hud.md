# QA cases — Cinematic Memex HUD (Phase 2)

**Feature:** Cinematic memex HUD redesign — Phase 2 (motion, transitions, tool scans).
**Spec:** `docs/specs/2026-05-20-cinematic-memex-hud.md`
**Plan:** `docs/plans/2026-05-20-cinematic-memex-hud.v2.md` — Task 14
**bd issue:** `ucs-s9c`
**Authored:** 2026-05-20 by qa-team.

Eight cases. Each case lists exact reproduction steps and expected
observations. The runner files defects (separate bd issues with
`gate:qa` label) for any failure — never fixes them.

## Pre-flight

- Worktree: `/Users/sara/Projects/wt-ucs-s9c` on branch
  `feat/ucs-s9c-qa-phase2-closeout` (synced to `origin/main` so
  Task 13's `CinematicTransition` is included).
- `.env` lives in repo root (`/Users/sara/Projects/URL-Cheat-Sheet/.env`)
  and contains `ANTHROPIC_API_KEY=...`. Never modify it.
- Preview: `bun run --filter @url-cheat-sheet/web dev` (local) — Vercel
  preview deploy is the preferred surface but local is the acceptable
  fallback per project rules.
- Browser: `claude-in-chrome` MCP.

---

## Case 1 — all five states render at three viewport widths

**Source:** spec §4 (state-by-state), §6.5 (dev override).

**Steps**

1. Resize browser to **1440 × 900**.
2. Navigate to `/?state=idle`. Verify wordmark, "LOAD URL TO YOUR
   MEMORY", URL input, `// AWAITING_SOURCE` anchor, `[ STANDBY ]` /
   `[ READY ]` pill, `001 SESSION` corner stamp.
3. Navigate to `/?state=extracting`. Verify `// INGESTING_SOURCE`
   anchor, `[ READING ]` pill, URL truncated, vertical bar, `+++`
   ticks (after 1.2s).
4. Navigate to `/?state=error`. Verify `// INGEST_FAILED` in amber,
   `[ HALTED ]` pill, error code `FETCH_TIMEOUT` in micro-caps,
   `[ NEW_SOURCE ]` CTA.
5. Navigate to `/?state=flagged`. Verify `// SOURCE_CAVEAT`,
   `[ REVIEW_REQUIRED ]` pill, threat table with severity bars, two
   CTAs.
6. Navigate to `/?state=ready`. Verify `// MEMORY_ACTIVE` chip,
   greeting (split-reveal), composer.
7. Resize to **1024 × 768**, repeat 2–6.
8. Resize to **375 × 812**, repeat 2–6.

**Assertions**

- All anchors / pills / CTAs render at all three widths.
- No layout overflow / horizontal scrollbar at 375px.
- No console errors at any viewport.

---

## Case 2 — URL submit → extracting → ready cinematic transition

**Source:** spec §4.2 exit transition; plan Task 13.

**Pre-condition:** `ANTHROPIC_API_KEY` set in `.env`.

**Steps**

1. Navigate to `/` (no query param).
2. Type `https://www.rfc-editor.org/rfc/rfc2324.html` in URL input.
3. Submit. Observe state transition.
4. Pay attention to:
   - vertical bar completing top-to-bottom (~800ms);
   - HUD panel collapsing (scale 0.6, translate up, clip-path);
   - chat surface materializing (opacity 0 → 1, scale 0.96 → 1);
   - total cinematic duration ~1600ms.
5. After transition: verify ready state with `// MEMORY_ACTIVE` chip,
   page title visible.

**Assertions**

- `<CinematicTransition>` overlay (`data-testid="cinematic-transition"`)
  is present in DOM during the transition window.
- No visual artifacts (clipping glitches, double-paint, layout shift).
- No console errors during transition.
- `pendingReady` is null after `onComplete` fires (the underlying
  state advances to `ready`).

---

## Case 3 — differentiated tool scans (`grep_doc` + `finalize`)

**Source:** spec §5.1, §5.2.

**Pre-condition:** Case 2 completed; in `ready` state with a real
document loaded; `ANTHROPIC_API_KEY` set.

**Steps**

1. From ready state with RFC 2324 loaded, type:
   `Which HTTP status codes are defined?`
2. Submit message. Observe assistant turn.
3. Identify the `grep_doc` scan card. Verify:
   - card chrome (0.5px hairline border, sys-voice header, status pill,
     `+++` tick cluster bottom-right);
   - interior is faint glyph-grid backdrop;
   - 1px horizontal scanline sweeps top-to-bottom over ~600ms in
     `--green-acid` (with glow);
   - status pill flips `[ SCANNING ]` → `[ <n> HITS ]` /
     `[ NO_HITS ]` via `scrambleIn`;
   - `phosphorFlash` fires once on hit count.
4. Identify the `finalize` scan card. Verify:
   - card chrome same as `grep_doc`;
   - interior shows a 2px-wide vertical compile-bar on the left edge,
     growing top-to-bottom;
   - each output line `scrambleIn`s as it streams;
   - status pill `[ COMPILING ]` → `[ COMPLETE ]`;
   - bar reaches 100% with `phosphorFlash` once.
5. After completion: verify glyph-grid backdrop dims (~4%) and cards
   stay persistent in thread.

**Assertions**

- `grep_doc` and `finalize` cards have visually distinguishable
  interiors (sweep vs. compile-bar) — not a shared default.
- Both cards remain visible after the turn completes.

---

## Case 4 — failure / cancellation states

**Source:** spec §5.3, §4.3.

**Steps**

**4a. Extract error (FETCH path)**

1. Navigate to `/`.
2. Type `http://127.0.0.1/` (blocked per SSRF guard).
3. Submit. Observe extract-error state.
4. Verify:
   - `// INGEST_FAILED` in `--amber-alarm`;
   - `[ HALTED ]` pill;
   - error code `FETCH_BLOCKED_URL` micro-caps;
   - `phosphorFlash` on the label (single pulse);
   - `[ NEW_SOURCE ]` CTA returns to idle.

**4b. Streaming abort**

1. From ready state (use `/?state=ready` dev override OR load a
   document via Case 2).
2. Set a real `ANTHROPIC_API_KEY` (already in `.env`); paste in
   settings drawer or load page.
3. Send a chat message likely to trigger multi-turn (`Summarize the
   document in 5 paragraphs`).
4. Mid-stream, navigate away or close the browser tab to cancel.
5. (Or: use DevTools to abort fetch via `fetch().abort()` — but tab
   close is the standard user gesture.)
6. Reload to the same URL; observe history if state persists.

**Assertions**

- Extract-error UI displays the spec's amber + `[ HALTED ]` + error
  code combination.
- No console errors during the fault path.
- Streaming abort does not crash the page; if observable, a
  `[ FAULTED ]` or `[ HALTED ]` pill appears on the in-flight scan
  card (spec §5.3).

---

## Case 5 — reduced-motion mode

**Source:** spec §3.5; ADR 0009.

**Steps**

1. Open DevTools → Rendering panel → "Emulate CSS media feature:
   `prefers-reduced-motion: reduce`".
2. Reload `/`. Verify ambient motion has stopped:
   - glow-pads not drifting;
   - spec-dots not floating;
   - cursor halo not following pointer;
   - turbulence filter at rest (no SVG re-animation).
3. Navigate `/?state=ready`. Verify greeting and composer appear
   without `splitLineReveal` animation (instant or simple opacity).
4. Navigate to `/`, submit a real URL, observe the `extracting → ready`
   transition. Verify:
   - cinematic transition collapses to an **instant state swap** —
     overlay unmounts on the same tick `onMount` fires (no GSAP
     timeline visible);
   - underlying state flips to `ready` without the 1600ms timeline.
5. Verify no GSAP-driven motion anywhere in the session.

**Assertions**

- Every ambient and showpiece motion is suppressed under
  reduced-motion (ADR 0009 strict fallback).
- The cinematic moment becomes an instant state swap; no overlay
  paint visible.
- Theme, palette, typography, HUD chrome, instrumentation labels are
  unchanged.

---

## Case 6 — mobile viewport (375px) atmosphere fallback

**Source:** spec §2.3 (atmosphere stack — mobile fallback PNG, spec
dots cut to 4–6, blur halved).

**Steps**

1. Open DevTools → Device toolbar → set 375 × 812 (iPhone 13).
2. Navigate to `/`.
3. Inspect computed styles / `.spec-dot` count via DOM (expect ≤ 6 at
   the mobile breakpoint).
4. Verify the turbulence-driven background does not look chunky /
   pixelated.
5. Check `backdrop-filter` blur radius is reduced (spec says halved).
6. Resize to `/?state=ready` and confirm composer + thread layout fits
   without horizontal scroll.

**Assertions**

- Spec-dot count is reduced at 375px.
- No horizontal scrollbar on any state at 375px.
- The atmosphere stack renders without console warnings.
- **Known absence:** the mobile fallback PNG (ucs-9vn) is
  intentionally not yet shipped — do not file as a defect.

---

## Case 7 — no console errors on any state or transition

**Source:** general health check.

**Steps**

1. Open DevTools → Console.
2. Navigate to each: `/`, `/?state=idle`, `/?state=extracting`,
   `/?state=error`, `/?state=flagged`, `/?state=ready`.
3. From `/`, ingest a real URL, complete cinematic transition.
4. From ready, send a real chat message (Case 3 flow).
5. From ready, click `> change` to reset to idle.
6. Toggle settings drawer open and closed.

**Assertions**

- Console error count = 0 across the full session.
- Console warnings allowed only if from third-party libraries
  (document any).

---

## Case 8 — Lighthouse scores (guidance, not blocking)

**Source:** spec §2.3 (atmosphere stack is the budget).

**Steps**

1. Open DevTools → Lighthouse panel.
2. Run a desktop audit on `/?state=ready`. Record performance score.
3. Run a mobile audit on `/?state=ready`. Record performance score.

**Targets**

- Desktop ≥ 80.
- Mobile ≥ 70.

**Assertions**

- If below target: file as a defect with the actual numbers; the
  orchestrator decides whether to block on it. Performance is
  guidance, not a hard gate.

---

## How to file defects (project rule)

For each failed assertion, create a bd issue:

```bash
bd create --title "[qa-defect] <short>" --type bug --priority 2 \
  --description "..." --labels "gate:qa"
bd dep add ucs-s9c <new-issue-id>
```

QA never fixes. Files only.
