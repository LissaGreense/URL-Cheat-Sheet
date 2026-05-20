# Cinematic Memex HUD — Design Spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review before plan
**Scope:** Full visual redesign of `apps/web/` (SvelteKit). API surface, schemas, and state machine unchanged.

---

## 1. Vision & emotional register

A cinematic, always-alive HUD for a personal knowledge instrument. The user
loads a web page into their "memory," then consults it through a calm,
terminal-voiced AI. The interface postures as an archival workstation —
instrumented, dark, green-accented, slightly ceremonial — but never
weaponized. Reading is curatorial; chatting is recall.

### Operating principles (priority order)

1. **The system is always alive.** Ambient motion never fully stops.
   5–8 simultaneous low-amplitude loops layered behind every state.
2. **Motion is rationed but cinematic.** Discipline at the curve level:
   three named easings do everything. Cinematic moments are short
   (500–900ms) and spatially focused — most of the screen is at rest
   while one cluster performs.
3. **The instrument speaks in micro-caps.** System voice is `// LIKE_THIS`
   and `> like_this`. Body and assistant prose are humanist sans, calm.

### Voice — archival / memex (not surveillance, not lab)

The system reads as a private knowledge instrument: calm, technical,
intimate. Labels frame the act of *consulting an archive you built
yourself*. Status copy avoids hostility (`[ READY ]` not
`[ TARGET_ACQUIRED ]`) and avoids neutrality (`[ READING ]` not
`[ ANALYZING ]`). Sentences are short. Periods are cuts.

---

## 2. Visual system

### 2.1 Palette (CSS custom properties)

```css
--ink-void:      #0a0a0b;                       /* deepest field */
--ink-base:      #131312;                       /* body gradient origin */
--ink-mid:       #1c1e22;                       /* body gradient mid */
--ink-rise:      #262c28;                       /* body gradient highlight */
--bone:          #e8e8e6;                       /* primary text */
--bone-dim:      rgba(232, 232, 230, 0.55);     /* secondary text */
--hair:          rgba(232, 232, 230, 0.12);     /* hairlines, borders */
--green-acid:    #bee26e;                       /* primary accent */
--green-deep:    #33524d;                       /* accent fill */
--teal-glacial:  rgba(91, 219, 198, 0.65);      /* secondary tint */
--seafoam-soft:  rgba(180, 255, 222, 0.5);      /* soft fills, focus rings */
--amber-alarm:   #d4a017;                       /* error-only, rationed */
```

Body background:
`linear-gradient(123deg, var(--ink-rise), var(--ink-mid), var(--ink-base))`.

**Rationing rules**

- 95% of pixels are black-to-grey. Saturation lives only in the accent.
- `--green-acid` is reserved for interactive elements, status pills,
  phosphor glows, and the cursor halo. It is *not* used for surfaces.
- `--amber-alarm` is the only warm color in the system and appears only
  in error states. Using it anywhere else dilutes its signal.
- `--teal-glacial` is the secondary instrumentation tint — used for
  glow-pad accents and citation footers, never for primary text.

### 2.2 Typography (two families, three registers)

```css
--font-display:  "Protrakt", "Space Grotesk", system-ui;  /* wide industrial */
--font-body:     "Manrope", system-ui;                    /* humanist sans */
```

| Register   | Family   | Weight       | Size      | Tracking      | Line-height |
|------------|----------|--------------|-----------|---------------|-------------|
| display    | display  | 600          | 48–96px   | -3% (-2.88px @ 96) | 1.0         |
| body       | body     | 400          | 14–16px   | -1%           | 1.5         |
| sys-voice  | body     | 400          | 10–12px caps | +0.84–1.2px | 1.2         |

No monospace family is shipped. The *mono feeling* comes entirely from
wide-tracked tiny caps in the sys-voice register. This is the
load-bearing typographic decision — it makes the interface read as
"instrumented" without dragging in 1990s terminal aesthetics.

### 2.3 Atmosphere stack (5 layers, bottom-to-top, no 3D, no video)

1. **Base body gradient** — diagonal near-black, faint green tilt.
2. **Ambient driver** — full-viewport SVG `<feTurbulence
   baseFrequency="0.006" numOctaves="2">` + `<feDisplacementMap>` at
   8% opacity, slow 60–90s drift via `@keyframes`. Mobile fallback:
   pre-rendered PNG of the filter output.
3. **Glow pads** — 2–3 absolutely-positioned blurred radial gradients
   in `--green-acid` / `--teal-glacial`, independent 12–20s drift
   cycles, opacity 0.06–0.10.
4. **Spec dots** — ~12 floating 6–14px circles, `mix-blend-mode:
   overlay`, opacity 0.25–0.40, staggered 8–20s `translate` +
   `opacity` keyframes. Mobile: cut to 4–6.
5. **HUD chrome** — `backdrop-filter: blur(8px)` panels with 0.5px
   `rgba(232,232,230,0.30)` borders; static 4–6% scanline overlay
   full-document; cursor-following radial-gradient mask layer.

### 2.4 Instrumentation vocabulary (zero motion cost, highest identity payoff)

| Form              | Use                                         | Examples                              |
|-------------------|---------------------------------------------|---------------------------------------|
| `// LABEL_NAME`   | Section headers, state names                | `// MEMORY_BANK`, `// INGESTING_SOURCE` |
| `> action_name`   | Action prompts, user-message prefix         | `> INGEST`, `> RECALL`                |
| `[ STATE ]`       | Status pills, bracketed                     | `[ READY ]`, `[ SCANNING ]`           |
| `+++`             | Tick clusters, panel corners                | activity indicator dots               |
| `001 SESSION`     | Persistent corner version stamp             | fixed bottom-right, never leaves      |
| `[ ]` corners     | Pseudo-element picture frames on cards      | hairline corner brackets              |
| Hairline rules    | Section dividers                            | `--hair` color, 1px                   |

---

## 3. Motion system

### 3.1 Easing tokens

```css
--ease-out-expo:    cubic-bezier(0.16, 1, 0.3, 1);   /* entrances, reveals */
--ease-out-soft:    cubic-bezier(0.33, 1, 0.68, 1);  /* state crossfades */
--ease-linear:      linear;                          /* ambient loops only */
```

Three curves. Discipline at the curve level is what stops cinematic from
sliding into chaotic. New curves require an ADR.

### 3.2 Duration tokens

```css
--dur-tick:      120ms;    /* status flip, tiny acknowledgments */
--dur-quick:     200ms;    /* hover, focus, micro-state */
--dur-enter:     500ms;    /* component entrance, panel reveal */
--dur-reveal:    800ms;    /* headline split-line, hero ingress */
--dur-cinema:    1600ms;   /* memory-load transition, loader cascade */
--dur-ambient:   8000ms;   /* glow-pad drift unit; loops are multiples */
```

### 3.3 Choreography primitives (Svelte actions)

| Primitive          | Behavior                                                                                  |
|--------------------|-------------------------------------------------------------------------------------------|
| `splitLineReveal`  | GSAP `SplitText` → lines `clip-path: inset(0 0 100% 0)` → `inset(0 0 0% 0)`, 60ms stagger, `--ease-out-expo`, `--dur-reveal`. |
| `scrambleIn`       | GSAP `ScrambleTextPlugin`, ~280ms, char set `01<>/|_-+=:`. Used on labels, status changes, streaming text. |
| `phosphorFlash`    | Single-frame `box-shadow` step 0 → max → fade in `--green-acid`, 280ms.                  |
| `scanSweep`        | 1px horizontal line top-to-bottom across glyph-grid backdrop, 600ms `--ease-out-expo`, opacity peaks mid-traversal. |
| `assembleCascade`  | 2px vertical bar grows top-to-bottom; text scramble-ins per line as the stream produces it. |
| `idleBreath`       | 1.0 → 1.04 → 1.0 scale loop, 6–10s `--ease-linear` yoyo.                                  |
| `cursorHalo`       | RAF-throttled `pointermove` → CSS vars `--cx`/`--cy` → fixed full-viewport radial gradient div, lerped 0.18 follow. |

### 3.4 Ambient discipline (the "always-alive" rule, made specific)

At any given moment the page runs:

- 1 turbulence-driven background drift (60–90s loop)
- 2–3 glow-pad drifts (12–20s loops, independent phases)
- ~12 spec-dot loops (8–20s, randomized phases)
- 1 cursor halo (continuous, pointer-driven)
- 1 scanline overlay (static, texture only)

Foreground motion is *additive* over this layer and lasts ≤ `--dur-cinema`.
Most of the page is at rest while one cluster performs; ambient never stops.

### 3.5 Reduced-motion fallback

**Strict fallback** per [ADR 0009](../adr/0009-prefers-reduced-motion.md).
Every Phase 2 motion action consults `prefers-reduced-motion` at module
evaluation. When set: ambient motion disabled (atmosphere layers stay
rendered at resting state), showpiece moments collapse to instant state
changes or simple opacity fades, the cinematic `extracting → ready`
transition becomes an instant state swap. Theme, palette, typography,
HUD chrome, and instrumentation vocabulary are unaffected — only motion
drops out. The single contract enforced at module-evaluation time keeps
the implementation discipline tight.

---

## 4. State-by-state design

All five states inherit the ambient stack and the persistent corner
stamp (`001 SESSION`, bottom-right, fixed). The top-left sys-voice
anchor *changes per state* — it is the state name itself rendered in
the `// LABEL_NAME` form. Sections below describe what changes per
state.

### 4.1 `idle`

- **Layout** — Centered column. Top: display-face wordmark
  `URL_CHEAT_SHEET`. Below: large display-face directive
  **"LOAD URL TO YOUR MEMORY"**. URL input as a HUD panel with
  `backdrop-filter` chrome. Action `> INGEST` rendered as a status pill
  `[ STANDBY ]` → `[ READY ]` (phosphor-flash on transition).
- **Sys-voice anchors** — `// AWAITING_SOURCE` (top-left) ·
  `[ STANDBY ]` / `[ READY ]` (pill) · `001 SESSION` (bottom-right)
- **Enter motion** — Page-load cascade: wordmark fades + split-line
  reveals (`--dur-reveal`); directive splits in with 60ms-staggered
  lines; HUD panel scales `0.96 → 1.00` + opacity 0 → 1 in
  `--dur-enter`. Total entrance ~1200ms.
- **Running** — Ambient stack only.

### 4.2 `extracting`

- **Layout** — Directive replaced by `// INGESTING_SOURCE` with the
  URL truncated to 56 chars below it in body sans. A vertical bar in
  `--green-acid` grows top-to-bottom against the HUD panel — read as
  "compiling, not measuring." Subtle scramble-text on the URL during
  ingest.
- **Sys-voice anchors** — `// INGESTING_SOURCE` · `[ READING ]` ·
  `001 SESSION`
- **Enter motion** — HUD panel inflates slightly
  (`scale 1.00 → 1.02`); URL string scramble-ins over 280ms; vertical
  bar begins indeterminate growth cycle. If the request takes >1.2s, a
  `+++` tick cluster appears in the panel's bottom-right and pulses
  every 800ms.
- **Exit transition → `ready`** — The **cinematic moment**:
  1. Vertical bar completes top-to-bottom (`--dur-cinema / 2`).
  2. HUD panel collapses to a small memory chip via `clip-path` mask
     sweep + scale to 0.6 + translate up.
  3. Simultaneously the chat surface materializes below via
     `splitLineReveal` of the "URL has been loaded to your memory"
     greeting; composer field scales in.
  4. Total transition ~1600ms.

  *Frame-by-frame storyboarding deferred to impl-team scene direction
  during Phase 2 — vocabulary is fixed in this spec, exact pixel timing
  is not.*

### 4.3 `extract-error`

- **Layout** — `// INGEST_FAILED` in `--amber-alarm` (the only place
  this color appears in the entire UI). Below: humanized error message
  in body sans. Single CTA `[ NEW_SOURCE ]` resets to idle.
- **Sys-voice anchors** — `// INGEST_FAILED` · `[ HALTED ]` · error
  code (`FETCH_TIMEOUT`, etc.) in micro-caps below the message.
- **Enter motion** — Amber `phosphorFlash` on `// INGEST_FAILED`
  (280ms, single pulse — no loop, this is not an alarm to dwell on);
  `scrambleIn` on the error code; HUD panel stays put. Restrained.
- **Running** — Ambient stack only.

### 4.4 `flagged`

- **Layout** — `// SOURCE_CAVEAT` (intentionally non-hostile — memex
  voice, not surveillance voice). Below: page metadata in 3 sys-voice
  rows (`> title:` / `> url:` / `> detected:`). Threat list rendered as
  a small table with severity bars (1px-tall, `--green-acid`, scaled to
  severity). Two CTAs: `[ CONTINUE_ANYWAY ]` and `[ NEW_SOURCE ]`.
- **Sys-voice anchors** — `// SOURCE_CAVEAT` · `[ REVIEW_REQUIRED ]`
- **Enter motion** — `phosphorFlash` on the caveat label; severity
  bars grow left-to-right with `--ease-out-expo`, staggered 80ms;
  threat-detection list `scrambleIn` per row.
- **Running** — Ambient stack only.

### 4.5 `ready` (the chat)

- **Layout** — Top: persistent **memory chip** showing
  `// MEMORY_ACTIVE` + the page title with `> change` link to reset.
  Center: scrolling thread. Bottom: composer field anchored. The
  composer is the only thing that does not dim — it is the active
  locus.
- **Greeting** (auto-injected, first paint) — `splitLineReveal` of:
  > URL has been loaded to your memory.
  > Ask questions to get knowledge access.
- **Sys-voice anchors** — `// MEMORY_ACTIVE` (top-left) ·
  `[ <hit-count> · RECALL_READY ]` (top-right, after first answer)
- **Message rendering**:
  - **User**: right-aligned, body sans, no chrome, `> ` prefix in
    `--green-acid` micro-caps.
  - **Assistant**: left-aligned, body sans, no role label (the absence
    of a prefix *is* the assistant). Each line scramble-ins as
    `finalize` emits.
  - **Tool calls**: differentiated scans (§5).
- **Composer** — HUD panel, animated caret in `--green-acid`. On send,
  the field scales `1 → 0.98 → 1` (`--dur-quick`) as the message
  detaches and floats up into the thread.

---

## 5. Tool-call choreography

Tool calls render inline in the assistant's message, *above* any text
that tool produces. Each scan card shares chrome (0.5px hairline border,
8px backdrop-filter, sys-voice header, status pill, bottom-right `+++`
tick cluster) but its **interior animation is differentiated by tool**.

### 5.1 `grep_doc` — scanline sweep

Card interior is a faint glyph-grid backdrop (~24×8 mono-glyph noise
pattern, 8% opacity in `--bone-dim`). A 1px horizontal line in
`--green-acid` with `box-shadow: 0 0 12px var(--green-acid)` travels
top-to-bottom across the grid.

**Timing**

- Card enters via `clip-path` reveal top-to-bottom, `--dur-enter`,
  `--ease-out-expo`.
- Status pill `scrambleIn` to `[ SCANNING ]` (280ms).
- Scanline sweep: 600ms `--ease-out-expo`, opacity peaks at
  mid-traversal (0 → 0.9 → 0.4).
- On result: pill scrambles to `[ <n> HITS ]` (or `[ NO_HITS ]`),
  `phosphorFlash`, hit count phosphor-flashes once.
- Glyph-grid backdrop dims to 4% opacity after completion. Card stays
  in the thread as a permanent record.

Query string rendered after `q:` prefix in body sans, `scrambleIn` over
200ms on first paint.

### 5.2 `finalize` — assemble cascade

A 2px-wide vertical bar in `--green-acid` (the *compile bar*) grows
top-to-bottom along the card's left edge. Each text line emerges from
behind the bar's leading edge via `scrambleIn`. The bar has a
`box-shadow: 0 0 18px var(--green-acid)` glow that follows its tip.

**Timing**

- Card enters with `clip-path` reveal.
- Compile-bar height = `(streamed_chars / total_estimated_chars)`
  capped at 100%, eased on each update.
- Each new line: `scrambleIn` (~180ms per line, no inter-line stagger
  — lines arrive as the stream produces them).
- On `output-available`: pill scrambles `[ COMPILING ]` →
  `[ COMPLETE ]`, bar reaches 100% and `phosphorFlash` once.
- Citations appear last in a bracketed footer, `scrambleIn` per
  citation token, 60ms stagger.

### 5.3 Failure / cancellation

- **Tool error** — Status pill scrambles to `[ FAULTED ]` in
  `--amber-alarm`; scanline / compile-bar freezes mid-motion and dims
  to 30%; error glyph (`!`) appears in the bottom-right where `+++`
  was. No `phosphorFlash` — we do not celebrate failures.
- **Streaming aborted** — Pill to `[ HALTED ]` in `--bone-dim`; bar
  stays at last position; card remains in thread.

### 5.4 Persistence in thread

Completed scan cards stay visible — they are the visible trace of what
the system did. Backdrop animation stops on completion; chrome stays.
A user scrolling back through a long chat should see *a record of the
system's reasoning*, not flashing cards. This matches the memex
register: the archive remembers what you asked it to do.

### 5.5 Future tools

Any new tool inherits the card chrome and gets a new interior primitive
named in this spec. The team adds them via a single registry
(`{ toolType → animationVariant }`). No tool falls back to a "default"
visual — each tool gets a deliberate scan vocabulary or it is not
ready to ship.

---

## 6. Technical approach

### 6.1 Stack additions

- **`gsap@^3.15`** with plugins: `ScrollTrigger`, `SplitText`,
  `ScrambleTextPlugin`, `CustomEase`. Registered once in a root
  `+layout.svelte`. Free under Webflow ownership; no Club GreenSock
  subscription needed. Tree-shakeable — only the plugins we import
  ship.
- **`lenis@^1.x`** — Instantiated in root layout, RAF loop wired to
  GSAP's `ticker`. ~3KB. The site uses native scroll behavior under
  Lenis; no virtual scroll container.
- **No WebGL, no Three.js, no video.** The ambient stack is CSS + one
  inline SVG `feTurbulence` filter (baked PNG on mobile).

### 6.2 Token surface (single source of truth)

- `apps/web/src/lib/styles/tokens.css` — palette, typography, easing,
  duration custom properties. Imported once in root layout.
- `apps/web/src/lib/styles/atmosphere.css` — the 5-layer ambient stack
  as scoped utility classes (`.atmosphere`, `.spec-dot`, `.glow-pad`,
  `.scanline`, `.cursor-halo`).
- `apps/web/src/lib/motion/` — one file per Svelte action:
  `splitLineReveal.ts`, `scrambleIn.ts`, `phosphorFlash.ts`,
  `scanSweep.ts`, `assembleCascade.ts`, `idleBreath.ts`,
  `cursorHalo.ts`. Actions, not components, so any element can opt in
  via `use:`.

### 6.3 Component decomposition (Svelte 5, runes)

| Component                                                  | Role                                                                 |
|------------------------------------------------------------|----------------------------------------------------------------------|
| `lib/components/hud/HudPanel.svelte`                       | Chrome wrapper: border, backdrop-filter, corner brackets, `+++` cluster |
| `lib/components/hud/StatusPill.svelte`                     | `[ STATE ]` with `scrambleIn` on change + `phosphorFlash`            |
| `lib/components/hud/SysLabel.svelte`                       | `// LABEL_NAME` and `> action_name` voice helpers                    |
| `lib/components/hud/CornerStamp.svelte`                    | Persistent session/version stamp                                     |
| `lib/components/chat/MessageStream.svelte`                 | Thread renderer                                                      |
| `lib/components/chat/ScanCard.svelte`                      | Tool-call card chrome                                                |
| `lib/components/chat/scans/GrepDocScan.svelte`             | Scanline-sweep interior                                              |
| `lib/components/chat/scans/FinalizeScan.svelte`            | Assemble-cascade interior                                            |

`+page.svelte` keeps the state machine; everything visual moves into
the components above.

### 6.4 What does NOT change

- `/api/extract`, `/api/chat`, `/api/health` endpoints. Untouched.
- The five-state machine (`idle | extracting | extract-error | flagged
  | ready`). Same discriminated union, same transitions.
- Schemas (`@url-cheat-sheet/schemas`). Untouched.
- The chat transport, the `Chat` instance, message-part rendering
  logic. Re-skinned, not rewired.

### 6.5 Testing posture

- **Vitest** unit tests for token resolution and the motion-action
  lifecycle (mount/unmount, prefers-reduced-motion bailout path
  stubbed).
- No Storybook in the repo; `+page.svelte` exposes
  `?state=<idle|extracting|flagged|error|ready>` query-param overrides
  in dev mode for visual review.
- **QA** via `qa-standard` skill against the deployed Vercel preview —
  the QA agent walks all five states + tool-call scenarios and files
  defects. QA never fixes.

---

## 7. Rollout

| Phase | Scope                                                                                            | Ships independently | bd issues (rough) |
|-------|--------------------------------------------------------------------------------------------------|---------------------|-------------------|
| 1 — Identity        | Palette, typography, atmosphere stack, instrumentation labels, HUD chrome, state layouts. Motion = simple fades. | Yes — visual identity complete on its own. | 1 epic + ~6 tasks |
| 2 — Choreography    | GSAP + Lenis wired; all primitives (`splitLineReveal`, `scrambleIn`, `phosphorFlash`, `scanSweep`, `assembleCascade`, `idleBreath`, `cursorHalo`); state-transition cinema; differentiated tool-call scans. | Yes — additive over Phase 1. | 1 epic + ~8 tasks |

### Deferred decisions

- **Cinematic exit-transition frame-by-frame storyboard**
  (`extracting → ready`). Vocabulary fixed in §4.2; pixel-exact timing
  is impl-team scene direction during Phase 2.

### Resolved decisions

- **`prefers-reduced-motion` strategy** — strict fallback per
  [ADR 0009](../adr/0009-prefers-reduced-motion.md). See §3.5 for the
  implementation contract.

---

## 8. Out of scope

- Backend changes (extract / chat / health endpoints, schemas, agent
  package).
- New tool calls or new chat capabilities. The two existing tools
  (`grep_doc`, `finalize`) get scan vocabularies; nothing new is
  introduced.
- Internationalization of sys-voice labels. English-only for v1.
- A light-mode escape hatch. The cyber-matrix register is the entire
  identity; a light variant would dilute it. If we later need one, it
  is its own ADR.
- Sound. No browser audio anywhere.
