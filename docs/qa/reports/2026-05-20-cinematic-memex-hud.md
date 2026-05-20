# QA Report — Cinematic Memex HUD (Phase 2) — 2026-05-20

**Case:** `../cases/cinematic-memex-hud.md`
**bd issue:** `ucs-s9c`
**PR:** Phase 2 close-out (worktree `wt-ucs-s9c`, branch
`feat/ucs-s9c-qa-phase2-closeout`)
**Run env:** Local `bun --filter @url-cheat-sheet/web dev` against
`http://localhost:5173/` (Vercel preview deploy not attempted — the
local dev path is sufficient for the eight cases below and matches the
plan's acceptable-fallback recipe).
**Run by:** qa-team agent (automated via claude-in-chrome MCP).
**Tab:** `1953848006`, hidden-mode (see "Harness limitation" below).

## Environment

- Worktree synced to `origin/main` (`22a8d44` — Task 13's
  `CinematicTransition` included).
- `.env` symlinked from `/Users/sara/Projects/URL-Cheat-Sheet/.env` —
  `ANTHROPIC_API_KEY` present (line count = 1).
- Unit tests: 29 files / 276 tests pass on this worktree.

## Harness limitation (read first)

The `claude-in-chrome` MCP runs in a Chrome window whose tabs are
permanently `document.visibilityState === 'hidden'`. Chrome throttles
`requestAnimationFrame` in hidden tabs to ~1Hz, which means **the GSAP
ticker never drives the cinematic transition's timeline to
completion** in this harness. We verified this empirically:

- `gsap.ticker` reports `frame: 0` after page load — the ticker is
  asleep because no listener has produced a real RAF tick.
- A manual `gsap.to(bar, { scaleY: 1, duration: 0.4 })` against the
  live overlay leaves `bar.style.transform` at the initial `scaleY(0)`
  state after 800ms (compare unit-test contract: GSAP fires
  `onComplete` synchronously when timeline runs).
- Force-advancing the active timeline via `gsap.globalTimeline.getChildren()
  → t.progress(1)` does fire `onComplete` and the page state machine
  flips to `ready` immediately — i.e. the wiring is correct, the
  blocked surface is RAF.

Where this matters for an acceptance case, we either (a) verified the
non-GSAP contract (DOM structure, state flip, mount/unmount), or (b)
force-advanced the timeline so the downstream behavior is observable.
Items that require **visible-tab visual verification** are flagged
`MANUAL_REVIEW_RECOMMENDED` in the results table — they belong on a
human's screen against the Vercel preview.

## Results

| # | Case                                       | Status                | Notes                                                                      |
|---|--------------------------------------------|-----------------------|----------------------------------------------------------------------------|
| 1 | All 5 states render at 3 viewports         | PASS                  | DOM verified at 1440 (true) + 1024 (real 849 due to OS min width) + 375 (CSS-rule emulation via injected `@media` constants — see Case 6). |
| 2 | URL submit → extracting → ready cinematic  | PASS / MANUAL_REVIEW  | Overlay mounts with `data-from="extracting" data-to="ready"`, timeline constructed with `totalDuration: 1.4s` + 3 child tweens (bar / panel / chat); force-advancing fires `onComplete` and the state flips to `ready` with the real document. Visual frame-by-frame timing is harness-blocked — recommend manual visual smoke on Vercel preview. |
| 3 | Differentiated scans (`grep_doc` + `finalize`) | FAIL                  | Card chrome rendered correctly (HudPanel corner brackets, sys-label header, status pill). `grep_doc` shows glyph-grid backdrop, `finalize` shows compile-bar — they ARE differentiated. **But** the visible query field always renders `q: ""` and the hit count always shows `[ 0 HITS ]`. Filed `ucs-aoo` + `ucs-ozi`. |
| 4 | Failure / cancellation states              | PARTIAL PASS          | 4a (real extract error via `http://127.0.0.1/`): `// INGEST_FAILED` in amber `rgb(212, 160, 23)` = `#d4a017`, `[ HALTED ]` pill, `FETCH_BLOCKED_URL` micro-caps, `[ NEW_SOURCE ]` CTA — all per spec §4.3. 4b (streaming abort): not exercised — requires interactive mid-stream cancel that the hidden-tab harness can't reliably reproduce; recommend manual smoke. |
| 5 | Reduced-motion strict fallback             | PASS                  | With `matchMedia('(prefers-reduced-motion: reduce)')` spoofed to `true` before the URL submission, the cinematic overlay mounts and unmounts on the **same tick** (`t=6568.3ms` for both events) — synchronous `onComplete`, no GSAP timeline. The underlying state flips to `ready` immediately. ADR 0009 contract honored. |
| 6 | Mobile viewport (375px)                    | PASS                  | Real 375px not reachable (Mac OS min Chrome window ≈ 849px). Verified the @media (max-width: 768px) rules in `atmosphere.css` via a force-injected stylesheet: spec-dots beyond `:nth-child(n+5)` hide (5 visible vs 13 at desktop), `--hud-blur-radius` flips `8px → 4px`, `.atmosphere__ambient` filter drops to `none`. Mobile fallback PNG (ucs-9vn) intentionally absent — not a defect. |
| 7 | No console errors on any state             | FAIL                  | Zero `console.error` / exceptions across the entire session — clean. But **210+ console warnings** for `tool-outline` and `tool-read_lines` unknown tool types from `MessageStream.svelte` during a single chat turn. Filed `ucs-8n1`. |
| 8 | Lighthouse ≥80 desktop / ≥70 mobile        | SKIPPED               | Lighthouse panel is not accessible via the chrome MCP. Recommend running manually against the Vercel preview before merge — performance is guidance, not blocking (per task brief). |

## Defects filed

| bd ID    | Severity | One-liner                                                                                                          |
|----------|----------|--------------------------------------------------------------------------------------------------------------------|
| ucs-aoo  | Major    | `GrepDocScan` always shows `q: ""` — `MessageStream.queryFor` reads `input.query` but tool schema uses `input.pattern`. |
| ucs-ozi  | Major    | `GrepDocScan` always shows `[ 0 HITS ]` — `MessageStream.hitsFor` reads `output.hits` but tool returns `output.matches`. |
| ucs-8n1  | Major    | `outline` + `read_lines` tools have no scan vocabulary — 210+ console warnings per chat turn, spec §5.5 violation. |

All three are blocked by `ucs-s9c` (via `bd dep add`).

## Detailed evidence per case

### Case 1 — five states at three viewports

DOM text dump per state at 1440 × 900 (the only true viewport reachable
in this harness):

- `?state=idle` → `// AWAITING_SOURCE`, `URL_CHEAT_SHEET` wordmark,
  `LOAD URL TO YOUR MEMORY` directive, `[ STANDBY ]` pill,
  `001 SESSION` corner.
- `?state=extracting` → `// INGESTING_SOURCE`, fixture URL,
  `[ READING ]` pill, `+++` ticks.
- `?state=error` → `// INGEST_FAILED`, dev override message,
  `FETCH_TIMEOUT` micro-caps, `[ HALTED ]` pill, `[ NEW_SOURCE ]` CTA.
- `?state=flagged` → `// SOURCE_CAVEAT`, `> TITLE/URL/DETECTED:` rows,
  `INSTRUCTION-OVERRIDE` + `DELIMITER` threats, `[ REVIEW_REQUIRED ]`
  pill, `[ CONTINUE_ANYWAY ]` + `[ NEW_SOURCE ]` CTAs.
- `?state=ready` → `// MEMORY_ACTIVE` × 2 (top-left anchor + memory
  chip header — both rendering the same label is intentional per spec
  §4.5), `> CHANGE` link, greeting, `> SEND` composer.

At 1024 × 768 and 375 × 812 widths the OS reported window width was
~849 in both attempts (Mac OS minimum Chrome window). No horizontal
scrollbar at any width. Spec-dot count was 13 at all widths — within
the spec's "~12" tolerance.

### Case 2 — cinematic transition contract

After submitting `https://www.rfc-editor.org/rfc/rfc2324.html`:

- `/api/extract` → 200.
- Mutation observer logged: `tx-mount` at `t=6187ms` (overlay added),
  `data-from="extracting" data-to="ready"`, `aria-hidden="true"`.
- `gsap.globalTimeline.getChildren()` reported the active cinematic
  timeline: `duration: 1.4s, totalDuration: 1.4s, children: 3,
  hasOnComplete: true`. The three child tweens (`duration: 0.8 / 0.8 /
  0.5`) match spec §4.2's bar / panel / chat beats.
- The timeline does not progress on its own in the hidden tab — bar
  remains at `matrix(1, 0, 0, 0, 0, 0)` (scaleY=0), chat at
  `opacity: 0, transform: matrix(0.96, ...)` 15 seconds in.
- Force-advancing via `t.progress(1)`: overlay unmounts within 11ms,
  state machine advances to `ready`, real document title "Hyper Text
  Coffee Pot Control Protocol (HTCPCP/1.0)" rendered.

The wiring is correct; the visual cannot be smoke-tested under this
harness.

### Case 3 — tool-call scans (FAIL)

After `ANTHROPIC_API_KEY` saved via the settings drawer and asking
"What HTTP status codes does this document define?":

- `/api/chat` → 200 (SSE stream).
- DOM: 2× `<GrepDocScan>` cards + 1× `<FinalizeScan>` card rendered.
- `grep_doc` cards: `hasGlyphGrid: true, hasCompileBar: false` — the
  spec §5.1 interior is in place.
- `finalize` card: `hasGlyphGrid: false, hasCompileBar: true` — spec
  §5.2 interior in place.
- Both card types share the `HudPanel` chrome — corner brackets
  (`tl/tr/bl/br`), sys-label header (`// GREP_DOC` / `// FINALIZE`),
  status pill.

Defects (filed):

- The `grep_doc` cards render `q: ""` (empty query) despite the model
  having called `grep_doc({pattern: '2.3'})` — see SSE evidence in
  ucs-aoo.
- The `grep_doc` cards always render `[ 0 HITS ]` despite the model
  having returned `output.matches = [{...}]` — see ucs-ozi.

### Case 4a — extract error path

Submitted `http://127.0.0.1/`:

- `// INGEST_FAILED` rendered in `rgb(212, 160, 23)` (exact match for
  `--amber-alarm: #d4a017`).
- `[ HALTED ]` pill in `rgb(232, 232, 230)` (bone, dim).
- Error code `FETCH_BLOCKED_URL` in micro-caps below the message,
  `rgba(232, 232, 230, 0.55)` (bone-dim, matches `--bone-dim` token).
- Humanized message "That URL is not allowed." per `humanizeError` in
  `+page.svelte`.
- `[ NEW_SOURCE ]` CTA returns to idle when clicked.

### Case 5 — reduced motion

After spoofing `matchMedia('(prefers-reduced-motion: reduce)') →
matches: true`:

- Mutation observer: `mount` at `t=6568.3ms`, `unmount` at the **same
  millisecond**. The cinematic moment collapses to an instant state
  swap.
- No GSAP `gsap.timeline()` instance is created — verified by the
  fact that `gsap.globalTimeline.getChildren()` returned no
  cinematic-type timeline during the brief mount window.
- Underlying state advances to `ready` with the real document.

### Case 6 — mobile breakpoint

CSS-injected emulation (force-applied the `@media (max-width: 768px)`
rules):

- Visible spec dots: 5 (parent container + 4 leaf dots) vs 13 at
  desktop — matches spec "cut to 4–6".
- `--hud-blur-radius`: `4px` vs `8px` at desktop — spec's "halved".
- `.atmosphere__ambient` filter: `none` vs the `feTurbulence` URL
  filter at desktop — spec's "strip turbulence on mobile".

The mobile fallback PNG (`--atmosphere-ambient-mobile-bg`) is not
populated — intentionally deferred to ucs-9vn, not a defect.

### Case 7 — console errors / warnings

Across the entire session (idle / extract / flagged / ready / chat /
reduced-motion / reset / settings drawer):

- **Zero** console errors / exceptions / TypeErrors.
- **210 console warnings** matching `[MessageStream] unknown tool
  type "tool-outline"` and `[MessageStream] unknown tool type
  "tool-read_lines"` during a single complex chat turn. Filed
  `ucs-8n1`.

### Case 8 — Lighthouse

Skipped — Lighthouse panel not reachable via the MCP. Recommend a
manual run on the Vercel preview before merge; performance is a
guidance gate, not a blocker.

## Recommendations to the orchestrator

1. **Do NOT mark `ucs-s9c` as `in_review`.** Three real defects need
   impl-team fix passes first.
2. Block PR merge until `ucs-aoo`, `ucs-ozi`, `ucs-8n1` are closed and
   QA re-runs clean on those acceptance criteria.
3. After defect fixes land, this report's Case 2, Case 4b, and Case 8
   should be re-run on a real Vercel preview deployment with a visible
   tab — those three items are the ones the hidden-tab MCP cannot
   exercise.

## Notes

- The `Chat is active in this tab group / Open chat / Dismiss /
  Claude is active in this tab group` text that occasionally appears
  in DOM dumps is the chrome MCP's own injected toolbar — not part
  of the app under test.
- The "double `// MEMORY_ACTIVE`" appearance in `?state=ready` (once
  as the top-left state anchor, once as the memory chip header) is
  per spec §4.5 — both anchor and chip use the same label. Not a
  defect.
- All unit tests (276) pass on this worktree — the defects above are
  integration-only (the unit tests for `GrepDocScan` pass props
  directly, bypassing `MessageStream.queryFor` / `hitsFor`, so the
  field-name mismatch is invisible at the component-test boundary).
  Recommend the impl team adds an integration test in
  `MessageStream.test.ts` that walks a real SSE-shape part through
  `queryFor` and `hitsFor` — that's the test that would have caught
  this drift.
