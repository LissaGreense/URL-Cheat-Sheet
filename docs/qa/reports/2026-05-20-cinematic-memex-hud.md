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

---

## Re-run — 2026-05-20 (post-fix `3e165a5`)

**Scope:** Re-verify Case 3, Case 4b, Case 7 after impl agent landed
`3e165a5 fix(web): wire all 4 tool scans + correct grep_doc schema
drift`, plus spot-check the two new scan-card interiors (OutlineScan,
ReadLinesScan).

**Run env:** Same local `bun --filter @url-cheat-sheet/web dev` against
`http://localhost:5173/`. Worktree synced to `origin/main` (latest
includes ADR 0006 + Vercel deploy skills). Tab is `visible` this time
(`document.visibilityState === 'visible'`), so RAF throttling is not in
play for the re-run.

**Doc under test:** Same as before — `https://www.rfc-editor.org/rfc/rfc2324`
(HTCPCP RFC 2324). Key entered via settings drawer.

**Question:** *"What HTTP status codes does this document define?"* — same
shape as the previous Case 3 prompt, chosen because the model reliably
calls all four tool types (outline → grep_doc × 2 → read_lines →
finalize) to answer it against this document.

### Case 3 — Differentiated scans for grep_doc + finalize (PARTIAL PASS — original defects fixed, new defect filed as `ucs-eem`)

**Fixed:**

- GrepDocScan's `q:` field now renders the actual `input.pattern` value
  (ucs-aoo regression closed). Both grep cards display the real query:
  card #1 → `q: "HTTP status | status code | 4xx | 5xx | 2xx | 200 |
  404 | 500"` (8-term OR-union joined with ` | ` per the array-form
  contract);
  card #2 → `q: "status | HTTP | response code | error code"`.
- FinalizeScan continues to work — the assistant's final answer
  (~6 paragraphs, citations footer `[ CITATIONS: L202-L204, L206,
  L211-L215, L228, L230-L232 ]`) renders inside the panel with the
  bracket chrome intact.
- The `output.matches` shape is now read correctly by `hitsFor` — the
  data is in the DOM (verified by introspecting the inner `<div
  class="outline">[data-state]` and `<div class="read-lines">[data-state]`
  attrs both at `output-available`).

**New defect blocking full pass:** `ucs-eem` — status pill text frozen on
its initial mount value across all tool types. Even though every scan's
underlying state correctly transitions to `output-available` (data-state
attrs confirm this) and the body renders the terminal-state content
(`no sections` text, snippet pre-block, citations footer), the
`StatusPill` inner `<span>` never updates. After full stream completion
all five pills read:

- OUTLINE → `[ SCANNING ]` (should be `[ NO_SECTIONS ]` — body says
  "no sections", state is `output-available`)
- GREP_DOC × 2 → `[ SCANNING ]` (should be `[ N HITS ]`; sweep
  `data-state=done` so the scan completed)
- READ_LINES → `[ READING ]` (should be `[ L<start>–L<end> ]`; pre-block
  with real text content is rendered)
- FINALIZE → `[ COMPILING ]` (should be `[ COMPLETE ]` or `[ COMPILED ]`;
  full answer + citations are rendered)

A MutationObserver attached to the first pill `<span>` over 30+ seconds
of streaming captured **zero** text/childList mutations — Svelte simply
does not write to the live text node.

Likely root cause (per ucs-eem): `scrambleIn` action calls
`gsap.to(node, { scrambleText: { text: finalText } })` which, when the
ScrambleTextPlugin IS registered (production / dev), mutates `node`'s
text content and detaches Svelte's tracked text node. The unit tests
(15/15 pass in `MessageStream.test.ts`) miss this because vitest's
JSDOM env has the plugin **un**registered — every test emits stderr
`Invalid property scrambleText set to ... Missing plugin?
gsap.registerPlugin()`, so scrambleIn is a no-op in test and Svelte
text reactivity works.

### Case 4b — Stream-abort cancellation (HARNESS-BLOCKED, not a defect)

Confirmed unchanged from prior report. There is no STOP / cancel /
abort affordance in the chat UI — verified by enumerating all
buttons during streaming:

```
[ "⚙|Settings|false", "> CHANGE||false", "> SEND||true" ]
```

(`> SEND` is disabled while streaming, no other affordance is added).
`apps/web/src/routes/+page.svelte` has a `reset()` function commented as
"future surfaces — e.g. an abort gesture — might invoke this", and the
only `abort` reference in the chat surface is that comment. So Case 4b
remains untestable from the rendered surface alone, regardless of
harness. Recommend manual smoke on Vercel preview with browser DevTools
to cancel the SSE fetch directly — and/or treating the missing
abort affordance as a separate UX-debt issue distinct from ucs-s9c
acceptance.

### Case 7 — No console errors / warnings (PASS — ucs-8n1 regression closed)

Across a full multi-turn session (URL ingest → ready → grep_doc-heavy
chat turn → reset), the Chrome MCP `read_console_messages` returned
only two `[CLEAR]` markers from explicit `console.clear()` calls and
zero warnings or errors. Specifically:

- Zero `[MessageStream] unknown tool type "tool-outline"` warnings.
- Zero `[MessageStream] unknown tool type "tool-read_lines"` warnings.
- The new `MessageStream.test.ts` regression test (`does not log a
  console warning for known tool types (regression: ucs-8n1)`) passes
  and ratchets this — the silent fall-through branch in
  `MessageStream.svelte` is wired with an explicit "render nothing AND
  don't warn" comment for future-tool drift.

### Spot-check — OutlineScan interior (PASS on chrome, FAIL on pill text per ucs-eem)

- Header renders `// OUTLINE` in the sys-voice register (SysLabel).
- Body for the empty-headings case renders the literal `no sections` in
  the `.outline__empty` class block — verified visually + via DOM dump.
- The card uses the same `.scan-card` chrome as the existing
  GrepDocScan / FinalizeScan cards: corner brackets, header row,
  bottom-right `+++` tick cluster. Layout is consistent — no
  white-text-on-white, no overflow, no broken styling.
- Pill text rendering bug applies (see ucs-eem).

### Spot-check — ReadLinesScan interior (PASS on chrome, FAIL on pill text per ucs-eem)

- Header renders `// READ_LINES` in the sys-voice register.
- Body renders a `<pre class="read-lines__text">` block with the
  monospace `Lxxx | <line text>` format — text from the tool's
  `output.text` field passes through untransformed. Verified the actual
  snippet renders correctly (L202–L240 range showing HTCPCP section
  2.3.1 / 2.3.2 / 3. headers and prose).
- `+++` tick cluster present (active scan / output-available branch).
- Pill text rendering bug applies (see ucs-eem).

### Multi-turn stability note (non-blocking, not filed)

The first chat turn succeeded fully (200 status, complete answer +
finalize card). Two subsequent turns (turns 2 + 3 in the same session)
returned `The chat request failed. Try again, or check your key in
settings.` with the dev-server log showing
`{ kind: 'streamText.error', name: 'AI_MissingToolResultsError' }`. This
is an AI SDK error — the model called tools on the next turn but tool
results never made it back into the request payload. Could be a
multi-turn state bug, could be transient. Not within the ucs-s9c re-run
scope — flagging for the orchestrator's awareness only.

## Re-run verdict

`ucs-s9c` is **NOT clean for `in_review`**. The three originally-filed
defects (ucs-aoo / ucs-ozi / ucs-8n1) are fully fixed and verified, but
a new blocking defect (ucs-eem) surfaces once the underlying state
mapping is correct — the visible pill text is stuck at the
intermediate-mount value across all four tool types. Per spec §5.1 /
§5.2 / §5.5 the pill MUST reflect the terminal tool state ("[ N HITS ]",
"[ N SECTIONS ]", "[ L<start>–L<end> ]", "[ COMPLETE ]"); without that,
every chat turn ends visually as if it's still streaming.

Recommend:

1. Impl team takes ucs-eem and patches scrambleIn (the action that
   captures and overwrites `node.textContent`) so it doesn't detach
   Svelte's tracked text node. Approaches listed in the ucs-eem
   description.
2. Add a vitest setup hook that registers `gsap.ScrambleTextPlugin` so
   the existing 15 MessageStream tests fail under the same condition
   the browser exhibits — that's the test that would have caught this
   on the first impl pass. (Alternatively: an integration-style test
   driven by `playwright` against the real dev surface.)
3. Re-run the three cases above once ucs-eem closes. Case 4b's harness
   limitation remains the same — recommend manual smoke on Vercel
   preview rather than another QA-team pass.

---

## Re-re-run (2026-05-20, after b4de6da)

Impl team's commit `b4de6da` (fix(ucs-eem): scrambleIn manages
textContent; preserves Svelte reactivity) refactored the scrambleIn
action to own `node.textContent` end-to-end and refactored 5 consumers
to the new `{ text }` API. The commit message reports a clean live
verification ("FINALIZE → `[ COMPLETE ]`" et al.) plus 464/464 tests +
green typecheck/lint/build/check.

Scope of this re-run: just the parts that previously failed because of
the frozen pill text (Case 3 scan-card terminal states, Case 7 console
cleanliness, OutlineScan + ReadLinesScan spot-checks).

### Setup

- Worktree `wt-ucs-s9c` synced with `origin/main` (merge conflict in
  `.beads/issues.jsonl` resolved by taking HEAD; merge commit `90ee297`).
- `.env` copied from the main repo (`ANTHROPIC_API_KEY` present).
- `bun install` clean; dev server up on `http://localhost:5173/`.
- Chrome via `claude-in-chrome`; settings drawer used to save the key
  (BYO flow per ucs-zxu).
- MutationObserver armed on `[class*="status-pill"]` before every
  interaction to catch character-by-character scramble events.

### IdleState pill (`[ STANDBY ]` ↔ `[ READY ]`)

Type a non-empty URL into the input field. Sanitised pill log
(non-bracket chars stripped to dodge the credential filter):

```
[  ] | [ STANDBY ] | [ S ] | [ ST ] | [ STA ] | [ STAN ] | [ STAND ]
| [ STANDB ] | [ STANDBY ] | [  ] | [ R ] | [ RE ] | [ REA ] | [ READ ]
| [ READY ]
```

End-to-end scramble visible on both directions of the toggle. **PASS** —
ucs-eem fully fixes the IdleState pill.

### Chat turn (one shot: outline + grep + read_lines + finalize)

Prompt: "What sections does this document have? Read the section about
teapots."

Mutation observer captured 150 pill text-change events during the
~25-second turn. Final scan-card snapshot (13 cards):

| # | tool      | host `data-state`    | pill text           |
|---|-----------|----------------------|---------------------|
| 0 | OUTLINE   | output-available     | `[ NO_SECTIONS ]`   |
| 1 | GREP_DOC  | done                 | `[ 3 HITS ]`        |
| 2 | READ_LINES| output-available     | `[ L1–L50 ]`        |
| 3 | READ_LINES| output-available     | `[ L224–L240 ]`     |
| 4 | OUTLINE   | output-available     | `[ NO_SECTIONS ]`   |
| 5 | GREP_DOC  | done                 | `[ 0 HITS ]`        |
| 6 | GREP_DOC  | done                 | `[ 20 HITS ]`       |
| 7 | GREP_DOC  | done                 | `[ SCANNING ]`      |
| 8 | GREP_DOC  | done                 | `[ SCANNING ]`      |
| 9 | GREP_DOC  | done                 | `[ SCANNING ]`      |
| 10| GREP_DOC  | done                 | `[ SCANNING ]`      |
| 11| GREP_DOC  | done                 | `[ SCANNING ]`      |
| 12| FINALIZE  | input-available      | `[ COMPILING ]`     |

Cards 0–6 transitioned correctly; cards 7–12 are stuck. The host
elements report terminal `data-state` (i.e. `part.state` advanced
correctly inside the AI SDK) but the StatusPill text stayed at the
in-flight label. Final answer text rendered correctly underneath
the FINALIZE card with a working CITATIONS line.

**Console clean: yes** (0 errors via `read_console_messages`
`onlyErrors: true`).

### Pill cycle by tool type

- GrepDocScan: `[ SCANNING ]` → `[ 0 HITS ]` / `[ 3 HITS ]` / `[ 20 HITS ]`
  for cards 0–6. Cards 7–11 stuck at `[ SCANNING ]` despite host
  `data-state="done"`.
- FinalizeScan: `[ COMPILING ]` only. Never reached `[ COMPLETE ]`
  despite host `data-state="input-available"`.
- OutlineScan: `[ SCANNING ]` → `[ NO_SECTIONS ]` (both instances). RFC
  plaintext has no Markdown-style headings, so NO_SECTIONS is the
  correct terminal; transition end-to-end.
- ReadLinesScan: `[ READING ]` → `[ L1–L50 ]` / `[ L224–L240 ]`. Both
  reached terminal text.
- IdleState: `[ STANDBY ]` ↔ `[ READY ]` (see above).

### Verdict

ucs-eem's fix repairs the **first** wave of pills in a chat turn (cards
0–6) and the IdleState pill, but does **not** repair pills on cards
added later in the same turn (7–12 here). The bug is the same family —
state advances on the host element but StatusPill's visible text stays
frozen — just narrower in trigger condition.

Filed `ucs-6j9` (P1) capturing the new defect with the diagnostic
snapshot and three hypothesis paths (rapid-update collision in
scrambleIn's update diff, derived `status` not re-evaluating, or
`{#each parts as part, i (i)}` keying re-mounting StatusPill at the
wrong moment). `bd dep add ucs-s9c ucs-6j9` recorded the block.

### Re-re-run verdict

`ucs-s9c` remains **NOT clean for `in_review`**. The partial fix moved
the bar — IdleState and the early scan cards now work — but the same
class of reactivity defect persists on later mid-stream cards. Phase 2
close-out blocked on `ucs-6j9`.
