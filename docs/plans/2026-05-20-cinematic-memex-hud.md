# Cinematic Memex HUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project pipeline note:** Per ADR 0006 + the `using-this-repo`
> skill, this plan should be converted to `bd` issues via the
> `task-creation` skill *before* implementation begins. Each top-level
> task below maps to one `bd` issue with status `proposed`, then
> enriched to `open` by `task-enrichment`. The orchestrator claims
> issues via `claim-next`.

**Goal:** Re-skin `apps/web/` (the SvelteKit URL-Cheat-Sheet UI) as a
cinematic memex HUD per `docs/specs/2026-05-20-cinematic-memex-hud.md`.
Dark/green cyber-matrix register, archival/memex voice, always-alive
ambient motion, differentiated tool-call scans. API surface and state
machine untouched.

**Architecture:** Two-phase rollout. Phase 1 ships the visual identity
(tokens, atmosphere stack, HUD primitives, state layouts) without
motion choreography. Phase 2 layers GSAP-driven choreography on top.
Each phase is a single bd epic + multiple task issues; each phase
ships independently.

**Tech Stack:**
- **Existing:** Svelte 5 (runes), SvelteKit 2.60, Vite 8, Zod 4,
  `@ai-sdk/svelte` 4, `@sveltejs/adapter-vercel`
  (`experimental_bun1.x`).
- **Phase 1 additions:** None — CSS + Svelte only.
- **Phase 2 additions:** `gsap@^3.15` with `ScrollTrigger`, `SplitText`,
  `ScrambleTextPlugin`, `CustomEase` plugins; `lenis@^1.x` for smooth
  scroll.

**Project-specific authoring rule (per `using-this-repo` skill):** This
plan specifies **signatures, acceptance criteria, affected files, and
library call references** — not verbatim implementation bodies.
Implementing agents grep the installed `.d.ts` for each library call
rather than copying from the plan. See the four-incident postmortem at
ucs-mmj for why.

---

## File structure (locked in here)

### Created in Phase 1

```
apps/web/src/lib/styles/
    tokens.css                   # palette, type, easing, duration custom props
    atmosphere.css               # 5-layer ambient stack utility classes (static)

apps/web/src/lib/components/atmosphere/
    AtmosphereShell.svelte       # composes the 5 layers; wraps the app

apps/web/src/lib/components/hud/
    HudPanel.svelte              # chrome wrapper (border, backdrop-filter, corners)
    StatusPill.svelte            # [ STATE ] bracketed pill
    SysLabel.svelte              # // HEADER or > action voice helper
    CornerStamp.svelte           # persistent corner stamp (001 SESSION)

apps/web/src/lib/components/states/
    IdleState.svelte             # state 1 — URL form
    ExtractingState.svelte       # state 2 — loading
    ExtractErrorState.svelte     # state 3 — fetch failed
    FlaggedState.svelte          # state 4 — prompt-injection caveat
    ReadyState.svelte            # state 5 — chat shell

apps/web/src/lib/components/chat/
    MessageStream.svelte         # thread renderer
    Composer.svelte              # bottom-anchored input
    ScanCard.svelte              # tool-call card chrome wrapper
    scans/
        GrepDocScan.svelte       # grep_doc card body (static in Phase 1)
        FinalizeScan.svelte      # finalize card body (static in Phase 1)

apps/web/src/routes/
    +layout.svelte               # imports tokens.css + atmosphere.css; wraps AtmosphereShell
```

### Created in Phase 2

```
apps/web/src/lib/motion/
    registerGsap.ts              # GSAP plugin registration + Lenis bootstrap
    scrambleIn.ts                # Svelte action — scramble-text reveal
    splitLineReveal.ts           # Svelte action — clip-path line reveal
    phosphorFlash.ts             # Svelte action — single-frame glow pulse
    idleBreath.ts                # Svelte action — 1.0→1.04→1.0 yoyo
    cursorHalo.ts                # Svelte action — pointer-following gradient
    scanSweep.ts                 # Svelte action — top-to-bottom scanline
    assembleCascade.ts           # Svelte action — compile-bar growth + per-line scramble

apps/web/src/lib/components/motion/
    CinematicTransition.svelte   # the extracting → ready exit transition

docs/adr/
    0009-prefers-reduced-motion.md  # records the strategy decision (Task 7)
```

### Modified

```
apps/web/package.json            # Phase 2: + gsap, lenis
apps/web/src/app.html            # font preconnect + face declarations
apps/web/src/routes/+page.svelte # state machine intact; visual markup moved to <State*>
```

### Untouched (explicitly out of scope)

```
apps/web/src/routes/api/        # endpoints unchanged
packages/schemas/               # schemas unchanged
packages/agent/                 # agent unchanged
```

---

# Phase 1 — Visual Identity

Ships the cyber-matrix register without motion. Simple opacity/scale
fades replace cinematic moments. All five states render with new
chrome. Tool-call cards render with HUD chrome but no scan animation.

---

## Task 1: Token foundation + atmosphere CSS scaffolding

**Files:**
- Create: `apps/web/src/lib/styles/tokens.css`
- Create: `apps/web/src/lib/styles/atmosphere.css`
- Create: `apps/web/src/lib/components/atmosphere/AtmosphereShell.svelte`
- Create: `apps/web/src/routes/+layout.svelte`
- Modify: `apps/web/src/app.html` (font preconnect + face declarations
  for Manrope; Protrakt fallback via `Space Grotesk` from
  `@fontsource/space-grotesk` if shipping Protrakt is licensing-blocked)

**Interfaces:**

`tokens.css` exports CSS custom properties at `:root`:
- Palette: `--ink-void`, `--ink-base`, `--ink-mid`, `--ink-rise`,
  `--bone`, `--bone-dim`, `--hair`, `--green-acid`, `--green-deep`,
  `--teal-glacial`, `--seafoam-soft`, `--amber-alarm` — values per
  spec §2.1.
- Typography: `--font-display`, `--font-body` — values per spec §2.2.
- Easing: `--ease-out-expo`, `--ease-out-soft`, `--ease-linear` —
  values per spec §3.1.
- Duration: `--dur-tick`, `--dur-quick`, `--dur-enter`, `--dur-reveal`,
  `--dur-cinema`, `--dur-ambient` — values per spec §3.2.

`atmosphere.css` exports utility classes:
- `.atmosphere`: fixed full-viewport container, z-index stack origin.
- `.atmosphere__base`: diagonal body gradient (z-index -5).
- `.atmosphere__ambient`: ambient driver layer (Phase 1: static
  pre-rendered PNG; Phase 2 swaps to live SVG `feTurbulence`).
- `.atmosphere__glow-pad`: radial gradient div (Phase 1: 1 static
  centered pad; Phase 2 adds drift).
- `.atmosphere__spec-dot`: 6-14px positioned circle (Phase 1: 4 dots,
  static; Phase 2 expands to 12 with motion).
- `.atmosphere__scanline`: full-document linear-gradient overlay at
  4-6% opacity, static texture only.
- `.atmosphere__cursor-halo`: positioned div (Phase 1: invisible
  placeholder; Phase 2 wires `pointermove`).

`AtmosphereShell.svelte` is a Snippet-wrapping component:
```ts
type Props = { children: Snippet };
```
Renders the five `.atmosphere__*` layers in z-order, then renders
`{@render children()}` above them.

`+layout.svelte`:
```ts
type Props = { children: Snippet };
```
Imports `tokens.css` and `atmosphere.css` once, wraps content in
`<AtmosphereShell>`, applies the body gradient via the html/body
selector in scoped style.

**Tests:**
- Create: `apps/web/src/lib/styles/tokens.test.ts`
  - Behavior: a JSDOM-rendered minimal component referencing
    `var(--green-acid)` resolves to the spec value `#bee26e`.
  - Mocks: none.
- Create:
  `apps/web/src/lib/components/atmosphere/AtmosphereShell.test.ts`
  - Behavior: rendering `AtmosphereShell` produces 5 layer elements in
    z-order; renders children above them.
  - Mocks: none. Use `@testing-library/svelte`.

**Steps:**

- [ ] **Step 1: Write failing tokens test.** Assert that resolving a
  CSS custom property in JSDOM returns the spec value. Run
  `bun run --filter @url-cheat-sheet/web test --
  apps/web/src/lib/styles/tokens.test.ts` — expect failure (file does
  not exist).
- [ ] **Step 2: Create `tokens.css` with all custom properties from
  spec §2.1, §2.2, §3.1, §3.2.** Re-run the test — expect pass.
- [ ] **Step 3: Write failing AtmosphereShell test.** Run — expect
  failure (component does not exist).
- [ ] **Step 4: Create `atmosphere.css` utility classes (static
  bodies only — no `@keyframes`).** Re-run — still failing
  (component absent).
- [ ] **Step 5: Create `AtmosphereShell.svelte` with the 5-layer
  composition.** Re-run — expect pass.
- [ ] **Step 6: Create `+layout.svelte` importing the token + atmosphere
  CSS and wrapping children in `<AtmosphereShell>`.**
- [ ] **Step 7: Update `app.html` with font preconnect + face
  declarations.** Use `@fontsource/manrope` (workspace dep) for body;
  display face is `Space Grotesk` via `@fontsource/space-grotesk` if
  Protrakt licensing not resolved.
- [ ] **Step 8: Run full check.** Run
  `bun run --filter @url-cheat-sheet/web check && bun run --filter
  @url-cheat-sheet/web test`. Expect green.
- [ ] **Step 9: Commit.** Conventional:
  `feat(web): token foundation + atmosphere scaffold (cinematic-memex-hud
  phase 1, task 1)`.

**Acceptance:**
- `tokens.css` defines every property listed in spec §2.1, §2.2, §3.1,
  §3.2.
- `AtmosphereShell` renders 5 layers and wraps children correctly.
- `bun run --filter @url-cheat-sheet/web check` passes.
- `bun run --filter @url-cheat-sheet/web test` passes.
- Visually: loading `/` in dev mode shows the dark body gradient and
  one static glow pad behind the existing (un-restyled) `+page.svelte`
  content.

---

## Task 2: HUD primitives — HudPanel, StatusPill, SysLabel, CornerStamp

**Files:**
- Create: `apps/web/src/lib/components/hud/HudPanel.svelte`
- Create: `apps/web/src/lib/components/hud/StatusPill.svelte`
- Create: `apps/web/src/lib/components/hud/SysLabel.svelte`
- Create: `apps/web/src/lib/components/hud/CornerStamp.svelte`

**Interfaces:**

`HudPanel`:
```ts
type Props = {
  children: Snippet;
  corners?: boolean;     // default true — render the [ ] corner brackets
  ticks?: boolean;       // default false — render +++ in bottom-right
  variant?: 'default' | 'alarm';  // alarm tints border with --amber-alarm
};
```
Renders a `<div>` with chrome:
`0.5px solid rgba(232, 232, 230, 0.30)`, `backdrop-filter: blur(8px)`,
`background: rgba(0, 0, 0, 0.15)`, conditional pseudo-element corner
brackets via `::before` / `::after`, conditional `+++` tick cluster.

`StatusPill`:
```ts
type Props = {
  state: string;         // e.g. 'READY', 'SCANNING', 'HALTED'
  tone?: 'normal' | 'alarm' | 'dim';  // default normal
};
```
Renders `<span>[ {state} ]</span>` with `--bone` or `--amber-alarm` or
`--bone-dim` color per tone. Sys-voice typography (10-12px caps,
+0.84-1.2px tracking).

`SysLabel`:
```ts
type Props = {
  kind: 'header' | 'action';
  children: Snippet;
};
```
- `kind === 'header'`: prefixes children with `//`.
- `kind === 'action'`: prefixes children with `>`.
- Always sys-voice register.

`CornerStamp`:
```ts
type Props = {
  text: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
};
```
Fixed-positioned sys-voice text. Used for the persistent `001 SESSION`
stamp.

**Tests:**
- Create:
  `apps/web/src/lib/components/hud/HudPanel.test.ts`
  - Children render; corners flag toggles the `::before`/`::after`
    presence (asserted via `getComputedStyle` content); ticks flag
    toggles `+++` text presence.
- Create:
  `apps/web/src/lib/components/hud/StatusPill.test.ts`
  - State text is wrapped in `[ ]`; tone changes color (assert via
    rendered class or inline style).
- Create:
  `apps/web/src/lib/components/hud/SysLabel.test.ts`
  - `kind: 'header'` prefixes `//`; `kind: 'action'` prefixes `>`.
- Create:
  `apps/web/src/lib/components/hud/CornerStamp.test.ts`
  - Position prop maps to CSS positioning (assert computed top/left).

**Steps:**

- [ ] **Step 1:** Write failing test for `HudPanel` (children render
  inside the panel root).
- [ ] **Step 2:** Implement `HudPanel.svelte` with the chrome and the
  two optional flags. Re-run — pass.
- [ ] **Step 3:** Repeat the red-green cycle for `StatusPill`,
  `SysLabel`, `CornerStamp` (one component per cycle, commit between
  each).
- [ ] **Step 4:** Run `bun run --filter @url-cheat-sheet/web check`
  — expect green.
- [ ] **Step 5:** Commit.
  `feat(web): hud primitives (cinematic-memex-hud phase 1, task 2)`.

**Acceptance:**
- Four components exist, typed, tested, and render the spec-defined
  chrome.
- Each component is consumable from a state component via simple prop
  passing.
- svelte-check passes; vitest passes.

---

## Task 3: State layouts — idle + extracting

**Files:**
- Create: `apps/web/src/lib/components/states/IdleState.svelte`
- Create: `apps/web/src/lib/components/states/ExtractingState.svelte`
- Modify: `apps/web/src/routes/+page.svelte` (extract idle + extracting
  branches into the new components; state machine logic stays).

**Interfaces:**

`IdleState`:
```ts
type Props = {
  urlInput: string;                  // bindable
  onSubmit: (e: SubmitEvent) => void;
};
```
Layout per spec §4.1. Composition:
- Display-face wordmark `URL_CHEAT_SHEET`.
- Display-face directive **`LOAD URL TO YOUR MEMORY`**.
- `<HudPanel>` wrapping a URL `<input type="url" bind:value={urlInput}>`.
- `<StatusPill state={urlInput.trim() ? 'READY' : 'STANDBY'}>`.
- `<SysLabel kind="action">INGEST</SysLabel>` as the submit button.
- `<CornerStamp text="001 SESSION" position="bottom-right">`.
- `<SysLabel kind="header">AWAITING_SOURCE</SysLabel>` top-left.

`ExtractingState`:
```ts
type Props = { url: string };
```
Layout per spec §4.2 (without exit transition — Phase 2). Composition:
- `<SysLabel kind="header">INGESTING_SOURCE</SysLabel>` top-left.
- URL truncated to 56 chars in body sans.
- `<HudPanel>` containing a vertical bar div, height animated via
  CSS `@keyframes` (indeterminate loop in `--green-acid`).
- `<StatusPill state="READING">`.
- `<CornerStamp text="001 SESSION" position="bottom-right">`.

**Tests:**
- Create:
  `apps/web/src/lib/components/states/IdleState.test.ts`
  - Renders the directive text; status pill flips on input validity;
    onSubmit fires on form submit.
- Create:
  `apps/web/src/lib/components/states/ExtractingState.test.ts`
  - Renders the truncated URL when URL > 56 chars; vertical bar
    element is present.

**Steps:**

- [ ] **Step 1:** Failing test for `IdleState` (directive renders).
- [ ] **Step 2:** Implement `IdleState`. Pass.
- [ ] **Step 3:** Failing test for pill state flip on input. Implement.
  Pass.
- [ ] **Step 4:** Failing test for onSubmit callback. Implement. Pass.
- [ ] **Step 5:** Repeat for `ExtractingState`.
- [ ] **Step 6:** Modify `+page.svelte` — replace the `state.kind ===
  'idle'` block with `<IdleState bind:urlInput onSubmit={loadUrl}>`
  and the `'extracting'` block with `<ExtractingState
  url={state.url}>`. Keep the discriminated union and `loadUrl`
  function untouched.
- [ ] **Step 7:** Manual visual check via `bun run --filter
  @url-cheat-sheet/web dev` — load `/`, see the new idle state; type
  a URL, submit, see the extracting state until network completes.
- [ ] **Step 8:** Run check + tests.
- [ ] **Step 9:** Commit.
  `feat(web): idle + extracting state layouts (cinematic-memex-hud
  phase 1, task 3)`.

**Acceptance:**
- Both state components render per spec.
- Existing state machine in `+page.svelte` is unchanged — only the
  visual markup is swapped.
- Submitting a URL still triggers the existing `loadUrl` function and
  transitions through states correctly.

---

## Task 4: State layouts — extract-error + flagged

**Files:**
- Create: `apps/web/src/lib/components/states/ExtractErrorState.svelte`
- Create: `apps/web/src/lib/components/states/FlaggedState.svelte`
- Modify: `apps/web/src/routes/+page.svelte`

**Interfaces:**

`ExtractErrorState`:
```ts
type Props = {
  message: string;       // already humanized upstream
  errorCode: string;     // e.g. 'FETCH_TIMEOUT'
  onReset: () => void;
};
```
Layout per spec §4.3. Composition:
- `<SysLabel kind="header" variant="alarm">INGEST_FAILED</SysLabel>`
  (header gets `--amber-alarm`).
- Message in body sans below the label.
- Error code in sys-voice micro-caps below the message.
- `<StatusPill state="HALTED" tone="alarm">`.
- `<SysLabel kind="action">NEW_SOURCE</SysLabel>` button that calls
  `onReset`.

`FlaggedState`:
```ts
import type { ExtractResponse } from '@url-cheat-sheet/schemas';
type Props = {
  preview: ExtractResponse;
  onContinue: () => void;
  onReset: () => void;
};
```
Layout per spec §4.4. Composition:
- `<SysLabel kind="header">SOURCE_CAVEAT</SysLabel>` (NOT alarm — memex
  voice is non-hostile).
- Three sys-voice rows: `> title: ...`, `> url: ...`, `> detected: ...`.
- Threat list rendered as a table with severity bars (1px-tall,
  `--green-acid`, width scaled to severity 0..1).
- Two action buttons: `<SysLabel kind="action">CONTINUE_ANYWAY</SysLabel>`
  and `<SysLabel kind="action">NEW_SOURCE</SysLabel>`.
- `<StatusPill state="REVIEW_REQUIRED">`.

**Tests:**
- `ExtractErrorState.test.ts`: renders error code; clicking reset
  fires `onReset`.
- `FlaggedState.test.ts`: threat rows render; continue/reset callbacks
  fire on click; severity bars have width proportional to severity.

**Steps:**

- [ ] **Step 1-4:** Red-green for `ExtractErrorState` (one cycle per
  behavior: message renders, error code renders, reset callback).
- [ ] **Step 5-8:** Red-green for `FlaggedState` (threat rows,
  severity bar widths, continue callback, reset callback).
- [ ] **Step 9:** Wire both into `+page.svelte`, replacing the existing
  `'extract-error'` and `'flagged'` blocks. The existing
  `humanizeError` and `confirmFlagged` functions stay; pass them as
  props.
- [ ] **Step 10:** Manual visual check — force the error state by
  submitting a blocked URL; force the flagged state if the test
  fixture exists (otherwise validate with the dev-mode override added
  in Task 6).
- [ ] **Step 11:** check + tests + commit.
  `feat(web): extract-error + flagged state layouts (cinematic-memex-hud
  phase 1, task 4)`.

**Acceptance:**
- Both state components render per spec; callbacks wired correctly.
- `--amber-alarm` color appears ONLY in the error state's header label
  and its status pill — verifiable via `grep` of compiled CSS.

---

## Task 5: State layout — ready (chat) + scaffolds

**Files:**
- Create: `apps/web/src/lib/components/states/ReadyState.svelte`
- Create: `apps/web/src/lib/components/chat/MessageStream.svelte`
- Create: `apps/web/src/lib/components/chat/Composer.svelte`
- Create: `apps/web/src/lib/components/chat/ScanCard.svelte`
- Create: `apps/web/src/lib/components/chat/scans/GrepDocScan.svelte`
- Create: `apps/web/src/lib/components/chat/scans/FinalizeScan.svelte`
- Modify: `apps/web/src/routes/+page.svelte`

**Interfaces:**

`ReadyState`:
```ts
import type { Chat } from '@ai-sdk/svelte';
import type { Document } from '@url-cheat-sheet/schemas';
type Props = {
  document: Document;
  chat: Chat;
  chatInput: string;     // bindable
  onSendChat: (e: SubmitEvent) => void;
  onReset: () => void;
};
```
Layout per spec §4.5. Composition:
- Top: memory chip — `<HudPanel ticks>` containing `<SysLabel
  kind="header">MEMORY_ACTIVE</SysLabel>` + page title + a
  `> change` link that calls `onReset`.
- Center: `<MessageStream messages={chat.messages}
  awaitingAssistant={...}>` (existing
  `awaitingAssistant` derivation stays in `+page.svelte` and is passed
  in).
- Bottom: `<Composer bind:value={chatInput} disabled={chat.status ===
  'streaming' || chat.status === 'submitted'} onSubmit={onSendChat}>`.
- Greeting (auto-rendered as the first system-injected message in
  `MessageStream` when `chat.messages.length === 0`): "URL has been
  loaded to your memory. Ask questions to get knowledge access."
- `<SysLabel kind="header">MEMORY_ACTIVE</SysLabel>` top-left.
- `<CornerStamp text="001 SESSION" position="bottom-right">`.

`MessageStream`:
```ts
import type { UIMessage } from 'ai';
type Props = {
  messages: ReadonlyArray<UIMessage>;
  awaitingAssistant: boolean;
};
```
- Renders an ordered list of messages.
- User messages: right-aligned, body sans, `> ` prefix in
  `--green-acid` micro-caps.
- Assistant messages: left-aligned, body sans, no role label.
- For each message part:
  - `type === 'text'`: render the text in body sans.
  - `type === 'tool-finalize'`: render `<FinalizeScan
    part={part}>` (Phase 1: static — chrome only, no animation;
    streams the text inside via `{input.answer}` when available, with
    citations footer).
  - `type === 'tool-grep_doc'`: render `<GrepDocScan part={part}>`
    (Phase 1: static).
  - Any other tool: render `<ScanCard>` with the tool type as the
    sys-label and a `<pre>` of the part JSON (debug fallback —
    spec §5.5 says no tool should fall back to default in production;
    we relax this for unknown tool types in dev only).
- When `awaitingAssistant` is true, append a placeholder assistant
  message with sys-voice "Thinking…".

`Composer`:
```ts
type Props = {
  value: string;        // bindable
  disabled: boolean;
  onSubmit: (e: SubmitEvent) => void;
};
```
- `<HudPanel>` wrapping a `<form>` with a text `<input>` and a submit
  `<button>`.
- Input placeholder: "Ask about this page..."
- Submit button: `<SysLabel kind="action">SEND</SysLabel>`.

`ScanCard`:
```ts
type Props = {
  toolName: string;          // e.g. 'GREP_DOC', 'FINALIZE'
  status: string;            // e.g. 'SCANNING', 'COMPLETE', 'HALTED', 'FAULTED'
  statusTone?: 'normal' | 'alarm' | 'dim';
  ticks?: boolean;           // bottom-right +++ cluster
  errorGlyph?: boolean;      // bottom-right ! glyph (replaces ticks on faulted)
  children: Snippet;         // card interior
};
```
- Wraps interior in `<HudPanel ticks={ticks}>`.
- Header row: `<SysLabel kind="header">{toolName}</SysLabel>` +
  `<StatusPill state={status} tone={statusTone}>`.
- Children render below the header.

`GrepDocScan` (Phase 1 — static):
```ts
type Props = {
  query: string;
  hits?: number | null;
  state: 'pending' | 'scanning' | 'done' | 'no-hits' | 'faulted' | 'halted';
};
```
- Wraps in `<ScanCard>` with state-derived status:
  `pending|scanning → 'SCANNING'`, `done → '<n> HITS'`,
  `no-hits → 'NO_HITS'`, `faulted → 'FAULTED'`, `halted → 'HALTED'`.
- Interior: a static glyph-grid backdrop (CSS `background-image` with
  inline SVG noise data URI) + the query string under `q: "..."`.
- No scanline animation in Phase 1.

`FinalizeScan` (Phase 1 — static):
```ts
import type { ToolUIPart } from 'ai';
type Props = { part: ToolUIPart };  // narrow to tool-finalize at runtime
```
- Wraps in `<ScanCard>` with status derived from `part.state`:
  `input-streaming → 'COMPILING'`,
  `input-available|output-available → 'COMPLETE'`,
  unknown → `'PENDING'`.
- Interior: streamed answer text (from `part.input?.answer`) +
  citations footer (`[ citations: §1, §3, ... ]`).
- No compile-bar animation in Phase 1 — the bar is a static 100%-tall
  div until Phase 2.

**Tests:**
- `ReadyState.test.ts`: memory chip renders title; reset callback
  fires; composer disabled state respected.
- `MessageStream.test.ts`: user vs assistant message styling; tool
  parts route to the right scan component; awaiting-assistant
  placeholder appears when prop is true.
- `Composer.test.ts`: typing updates value; submit fires callback;
  disabled state blocks submission.
- `ScanCard.test.ts`: header + status pill render; children render;
  `errorGlyph` replaces `ticks` when set.
- `GrepDocScan.test.ts`: state prop maps to correct status string.
- `FinalizeScan.test.ts`: part.state maps to correct status; answer
  renders when input.answer present.

**Steps:**

- [ ] **Step 1:** Red-green for `ScanCard` (chrome + props).
- [ ] **Step 2:** Red-green for `GrepDocScan` (state → status mapping).
- [ ] **Step 3:** Red-green for `FinalizeScan` (state → status mapping,
  answer rendering).
- [ ] **Step 4:** Red-green for `Composer` (input + submit + disabled).
- [ ] **Step 5:** Red-green for `MessageStream` (user/assistant
  styling, tool-part routing, awaiting placeholder).
- [ ] **Step 6:** Red-green for `ReadyState` (composition, memory
  chip, reset).
- [ ] **Step 7:** Modify `+page.svelte` — replace the `'ready'` block
  with `<ReadyState document chat bind:chatInput onSendChat={sendChat}
  onReset={reset}>`. The existing `Chat` instance, `awaitingAssistant`
  derivation, `sendChat`, `reset`, and `humanizeError` functions stay
  in `+page.svelte`.
- [ ] **Step 8:** Manual visual check — submit a real URL (requires
  `.env` with `ANTHROPIC_API_KEY` per project rules; ask the user if
  unset), send a chat message, watch tool calls render with HUD
  chrome.
- [ ] **Step 9:** check + tests + commit.
  `feat(web): ready state + chat scaffolds (cinematic-memex-hud
  phase 1, task 5)`.

**Acceptance:**
- All six new components exist, typed, tested.
- Chat flow works end-to-end with the existing `/api/chat` endpoint.
- Tool calls render with HUD chrome — no animation yet (Phase 2).
- The 319-line monolith `+page.svelte` is reduced to state-machine
  routing + the existing helper functions (`humanizeError`,
  `confirmFlagged`, `reset`, `sendChat`, `loadUrl`).

---

## Task 6: Dev-mode state override + Phase 1 close-out

**Files:**
- Modify: `apps/web/src/routes/+page.svelte`

**Interfaces:**

In `+page.svelte`, add a `$derived` that reads `import.meta.env.DEV`
and the `$page.url.searchParams.get('state')` to optionally override
the state for visual review. Production builds ignore the param.

Override map:
```ts
type StateOverride = 'idle' | 'extracting' | 'flagged' | 'error' | 'ready';
```
Each override produces a synthetic `State` value with seed data so the
state component renders without going through the state machine.

**Steps:**

- [ ] **Step 1:** Add the dev-mode override derivation to
  `+page.svelte`. Reuses existing types from
  `@url-cheat-sheet/schemas`.
- [ ] **Step 2:** Smoke-check each override URL in dev mode: `/?state=idle`,
  `/?state=extracting`, `/?state=flagged`, `/?state=error`,
  `/?state=ready`.
- [ ] **Step 3:** Run full check, test, build.
- [ ] **Step 4:** Commit.
  `feat(web): dev-mode state override (cinematic-memex-hud phase 1,
  task 6)`.
- [ ] **Step 5:** Mark Phase 1 PR ready for review (move out of draft
  via `gh pr ready <pr>`). The orchestrator handles the merge after
  CI green + any `gate:*` labels clear.

**Acceptance:**
- All five states visually reviewable via dev-mode query params.
- `bun run --filter @url-cheat-sheet/web build` produces a production
  bundle that does NOT include the override code path (verify by
  searching the dist for the literal string `state=`).
- Phase 1 PR is green and ready.

---

# Phase 2 — Choreography

Layers GSAP-driven motion on top of the Phase 1 visual identity. Phase
1 must be merged and live before Phase 2 starts (or at minimum, Phase 1
on an integration branch that Phase 2 rebases on).

---

## Task 7: ADR — `prefers-reduced-motion` strategy (decision gate)

**Files:**
- Create: `docs/adr/0009-prefers-reduced-motion.md`

**Why this is a task, not a sub-step:** The spec §3.5 explicitly defers
this decision. Phase 2 ships motion that respects (or ignores) the OS
setting — the strategy must be recorded before any motion action is
written, because every action consults it.

**Three options on the table** (from the brainstorming session):

| Option | Behavior | Trade-off |
|---|---|---|
| Strict | Honor OS setting. Ambient drift + glyph rain disabled; showpieces collapse to instant state changes or simple fades. Theme/colors stay cinematic; only motion drops out. | Standard modern-web posture. Best a11y. Loses ~half the brand identity for affected users. |
| Soft | Honor the setting but keep one signature moment (the memory-load transition) as a slower, gentler version. Ambient effects off, showpieces simplified but not eliminated. | Compromise. Preserves identity. Slightly above modern-web baseline (signature moment runs regardless). |
| No fallback | Cinematic for everyone, OS setting ignored. | Strongest brand consistency. Ships an a11y regression — not recommended. |

**Steps:**

- [ ] **Step 1:** Surface the three options to the user. Ask them to
  pick.
- [ ] **Step 2:** Write `docs/adr/0009-prefers-reduced-motion.md`
  recording the choice + rationale. Follow the existing ADR template
  (see `docs/adr/0008-no-ci-evals.md` for format).
- [ ] **Step 3:** Update `docs/specs/2026-05-20-cinematic-memex-hud.md`
  §3.5 to point at the ADR and remove the TBD marker. Update §7
  Deferred decisions accordingly.
- [ ] **Step 4:** Commit.
  `docs(adr): prefers-reduced-motion strategy (cinematic-memex-hud
  phase 2, task 7)`.

**Acceptance:**
- ADR 0009 exists and records the decision.
- Spec §3.5 and §7 are updated to reference the ADR.
- All subsequent Phase 2 tasks reference this ADR when implementing
  motion bailout paths.

---

## Task 8: Install GSAP + Lenis; register plugins

**Files:**
- Modify: `apps/web/package.json` (add `gsap`, `lenis`)
- Create: `apps/web/src/lib/motion/registerGsap.ts`
- Modify: `apps/web/src/routes/+layout.svelte` (call registration on
  mount, instantiate Lenis, wire Lenis to `gsap.ticker`)

**Interfaces:**

`registerGsap.ts` exports:
```ts
export function registerGsap(): void;
```
Calls `gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin,
CustomEase)` and registers any custom eases referenced by name from
the token system. Idempotent (safe to call multiple times).

Lenis instantiation happens in the layout's `$effect`. Per the
[Lenis README installed-version reference](node_modules/lenis/README.md),
construct `new Lenis({ smoothWheel: true })` and call
`gsap.ticker.add((time) => lenis.raf(time * 1000))`.

**Dependency check before pinning** (per memory feedback
[[feedback-use-current-versions]] and
[[feedback-verify-versions-via-npm-view]]): run
`npm view gsap version` and `npm view lenis version` immediately
before adding to `package.json`. Use the verified version, NOT the
versions named in the spec (`^3.15`, `^1.x`).

**Steps:**

- [ ] **Step 1:** Verify current `gsap` and `lenis` versions via
  `npm view`. Record them.
- [ ] **Step 2:** `bun add gsap@<verified-version> lenis@<verified-version>
  --filter @url-cheat-sheet/web`.
- [ ] **Step 3:** Verify `bun.lock` updated (NOT `bun.lockb` — project
  rule).
- [ ] **Step 4:** Write `registerGsap.ts` importing the four plugins
  and calling `gsap.registerPlugin`. Reference the plugin import paths
  by reading the installed `node_modules/gsap/dist/` index (do NOT
  guess — package layout changed in recent versions).
- [ ] **Step 5:** Update `+layout.svelte` to call `registerGsap()` on
  mount and bootstrap Lenis wired to `gsap.ticker`.
- [ ] **Step 6:** Run `bun run --filter @url-cheat-sheet/web build`.
  Expect green. Open the dev server and confirm Lenis is taking over
  scroll (page scrolls smoothly with a slight inertia).
- [ ] **Step 7:** Commit.
  `feat(web): gsap + lenis bootstrap (cinematic-memex-hud phase 2,
  task 8)`.

**Acceptance:**
- `gsap` and `lenis` appear in `package.json` dependencies.
- `registerGsap()` runs on app mount; no console errors.
- Lenis smooth scroll is active on `/`.

---

## Task 9: Motion actions — scrambleIn + splitLineReveal

**Files:**
- Create: `apps/web/src/lib/motion/scrambleIn.ts`
- Create: `apps/web/src/lib/motion/splitLineReveal.ts`
- Create: `apps/web/src/lib/motion/scrambleIn.test.ts`
- Create: `apps/web/src/lib/motion/splitLineReveal.test.ts`

**Interfaces:**

```ts
// scrambleIn.ts
export type ScrambleInParams = {
  chars?: string;       // default '01<>/|_-+=:'
  duration?: number;    // default 280 (ms)
  delay?: number;       // default 0 (ms)
};
export function scrambleIn(
  node: HTMLElement,
  params?: ScrambleInParams,
): ActionReturn<ScrambleInParams>;
```
Behavior:
- On mount, capture `node.textContent`, set the node's text to a
  scrambled placeholder, then call `gsap.to(node, { scrambleText: { ... } })`
  to resolve to the captured text over `duration`.
- Honors `prefers-reduced-motion` per ADR 0009: if reduced, skip the
  scramble and set the text directly.
- Returns a Svelte action; supports `update` for re-running on prop
  change.

```ts
// splitLineReveal.ts
export type SplitLineRevealParams = {
  stagger?: number;     // default 60 (ms)
  duration?: number;    // default 800 (ms)
  delay?: number;       // default 0 (ms)
};
export function splitLineReveal(
  node: HTMLElement,
  params?: SplitLineRevealParams,
): ActionReturn<SplitLineRevealParams>;
```
Behavior:
- On mount, run `new SplitText(node, { type: 'lines' })` (lib ref:
  `gsap/SplitText`) and then animate each line's `clip-path` from
  `inset(0 0 100% 0)` to `inset(0 0 0% 0)` with the spec'd stagger
  and easing.
- Honors reduced-motion per ADR 0009.
- Cleans up the SplitText instance on `destroy`.

**Tests:**
- `scrambleIn.test.ts`: action mounts, sets text, scheduling runs;
  in reduced-motion mode the final text is set immediately without
  GSAP scheduling.
- `splitLineReveal.test.ts`: action mounts, SplitText instance is
  created and destroyed cleanly; lines exist as child nodes after
  mount.

**Steps:**

- [ ] **Step 1:** Red-green for `scrambleIn` happy path.
- [ ] **Step 2:** Red-green for `scrambleIn` reduced-motion bypass.
- [ ] **Step 3:** Red-green for `splitLineReveal` happy path.
- [ ] **Step 4:** Red-green for `splitLineReveal` reduced-motion bypass.
- [ ] **Step 5:** Apply `use:scrambleIn` to the StatusPill component's
  state text (so status changes scramble) — single-line follow-up
  edit, no new file.
- [ ] **Step 6:** Apply `use:splitLineReveal` to the IdleState
  directive — single-line edit.
- [ ] **Step 7:** Manual visual check in dev: refresh `/` and watch the
  directive split-reveal; type a URL and watch the status pill
  scramble from STANDBY → READY.
- [ ] **Step 8:** check + tests + commit.
  `feat(web): scrambleIn + splitLineReveal motion actions
  (cinematic-memex-hud phase 2, task 9)`.

**Acceptance:**
- Both actions exist, typed, tested.
- Status pill scramble visible in dev.
- Directive split-reveal visible on idle state mount.
- Reduced-motion users get instant resolution (no GSAP scheduling).

---

## Task 10: Motion actions — phosphorFlash + idleBreath + cursorHalo

**Files:**
- Create: `apps/web/src/lib/motion/phosphorFlash.ts`
- Create: `apps/web/src/lib/motion/idleBreath.ts`
- Create: `apps/web/src/lib/motion/cursorHalo.ts`
- Create: test files for each (same pattern as Task 9).

**Interfaces:**

```ts
// phosphorFlash.ts
export type PhosphorFlashParams = {
  trigger: unknown;         // any value; flash fires when this changes
  duration?: number;        // default 280 (ms)
  color?: string;           // default 'var(--green-acid)'
};
export function phosphorFlash(
  node: HTMLElement,
  params: PhosphorFlashParams,
): ActionReturn<PhosphorFlashParams>;
```
- Pure CSS — no GSAP. Adds a class that runs a one-shot `@keyframes`
  defined in `tokens.css`. The action removes the class after
  `duration` so it can re-fire on the next trigger change.

```ts
// idleBreath.ts
export type IdleBreathParams = {
  scaleTo?: number;         // default 1.04
  duration?: number;        // default 8000 (ms)
};
export function idleBreath(
  node: HTMLElement,
  params?: IdleBreathParams,
): ActionReturn<IdleBreathParams>;
```
- Pure CSS keyframes yoyo. Honors reduced-motion (no class applied).

```ts
// cursorHalo.ts
export type CursorHaloParams = {
  follow?: number;          // lerp factor, default 0.18
};
export function cursorHalo(
  node: HTMLElement,
  params?: CursorHaloParams,
): ActionReturn<CursorHaloParams>;
```
- Throttled `pointermove` listener writes `--cx`/`--cy` CSS variables
  to the node. RAF loop lerps the rendered position toward the latest
  raw position by `follow`. The node itself is the
  `.atmosphere__cursor-halo` placeholder div from Task 1.
- On pointer-coarse devices (touch), the action no-ops.
- Honors reduced-motion: if reduced, the halo is hidden entirely.

**Tests:** each action has happy-path + reduced-motion test. CursorHalo
also has a pointer-coarse test (mock `matchMedia('(pointer: coarse)')`).

**Steps:**

- [ ] **Step 1-3:** Red-green for `phosphorFlash` (happy, reduced,
  re-fire on trigger change).
- [ ] **Step 4-5:** Red-green for `idleBreath` (happy, reduced).
- [ ] **Step 6-8:** Red-green for `cursorHalo` (happy, reduced, coarse).
- [ ] **Step 9:** Apply `use:phosphorFlash` to `StatusPill` when its
  `state` prop changes (using the prop value as the trigger).
- [ ] **Step 10:** Apply `use:idleBreath` to the corner version stamp
  and glow pads (in `AtmosphereShell`).
- [ ] **Step 11:** Apply `use:cursorHalo` to the
  `.atmosphere__cursor-halo` div in `AtmosphereShell`.
- [ ] **Step 12:** Manual visual check — status pill flashes on
  change; corner stamp breathes; cursor halo follows the pointer.
- [ ] **Step 13:** check + tests + commit.
  `feat(web): phosphorFlash + idleBreath + cursorHalo actions
  (cinematic-memex-hud phase 2, task 10)`.

**Acceptance:**
- Three actions exist, typed, tested.
- Visual effects applied per spec.
- Reduced-motion users see static elements; pointer-coarse users see
  no cursor halo.

---

## Task 11: Motion actions — scanSweep + assembleCascade (tool-call interiors)

**Files:**
- Create: `apps/web/src/lib/motion/scanSweep.ts`
- Create: `apps/web/src/lib/motion/assembleCascade.ts`
- Modify: `apps/web/src/lib/components/chat/scans/GrepDocScan.svelte`
- Modify: `apps/web/src/lib/components/chat/scans/FinalizeScan.svelte`
- Create: test files for each action.

**Interfaces:**

```ts
// scanSweep.ts
export type ScanSweepParams = {
  trigger: unknown;            // value identity; sweep fires when this changes
  duration?: number;           // default 600 (ms)
};
export function scanSweep(
  node: HTMLElement,
  params: ScanSweepParams,
): ActionReturn<ScanSweepParams>;
```
- Animates a child element (the scanline) via `gsap.to` from `top:
  0%` to `top: 100%` with opacity timeline `0 → 0.9 → 0.4` peaking at
  mid-traversal. Uses `--ease-out-expo` from the token system via
  `CustomEase.create(...)` only if not already registered.
- Honors reduced-motion (skips animation, leaves scanline hidden).

```ts
// assembleCascade.ts
export type AssembleCascadeParams = {
  streamedChars: number;       // current count
  totalEstimatedChars: number; // grows as the stream arrives
};
export function assembleCascade(
  node: HTMLElement,
  params: AssembleCascadeParams,
): ActionReturn<AssembleCascadeParams>;
```
- Animates a child `.compile-bar` element's height to
  `(streamedChars / totalEstimatedChars)` capped at 100% on every
  `update`. New text lines (detected via mutation observer on the
  text container or via prop diff) scramble-in.
- Honors reduced-motion (compile bar jumps to current %; text appears
  without scramble).

**Modifications:**

`GrepDocScan.svelte`:
- Add a scanline `<div>` inside the glyph-grid backdrop.
- Apply `use:scanSweep={{ trigger: state }}` to fire on state
  transitions into `'scanning'`.
- After completion (`state === 'done'` or `'no-hits'`), dim the
  glyph-grid backdrop opacity to 4% via class toggle.

`FinalizeScan.svelte`:
- Add a `.compile-bar` left-edge `<div>`.
- Apply `use:assembleCascade={{ streamedChars, totalEstimatedChars }}`
  where `streamedChars = (input.answer ?? '').length` and
  `totalEstimatedChars` is tracked locally as the running max of
  `streamedChars` seen so far + a buffer of 200 (heuristic — final
  answers are usually <2000 chars, this gives the bar room to grow).
- On `output-available`: `phosphorFlash` the compile bar once.

**Tests:**
- `scanSweep.test.ts`: trigger change schedules a GSAP timeline;
  reduced-motion skips.
- `assembleCascade.test.ts`: bar height tracks ratio; reduced-motion
  jumps directly; new lines scramble-in (mocked observer).

**Steps:**

- [ ] **Step 1-2:** Red-green for `scanSweep`.
- [ ] **Step 3-4:** Red-green for `assembleCascade`.
- [ ] **Step 5:** Wire `scanSweep` into `GrepDocScan`.
- [ ] **Step 6:** Wire `assembleCascade` into `FinalizeScan`.
- [ ] **Step 7:** Manual visual check — send a question that triggers
  `grep_doc`; watch the scanline sweep; watch `finalize` compile bar
  grow as the answer streams.
- [ ] **Step 8:** check + tests + commit.
  `feat(web): scanSweep + assembleCascade actions
  (cinematic-memex-hud phase 2, task 11)`.

**Acceptance:**
- Both actions exist, typed, tested.
- `grep_doc` and `finalize` cards animate per spec §5.
- Failure / cancellation states match spec §5.3 (no phosphor-flash
  on faulted, halted bar stays at last position).

---

## Task 12: Atmosphere stack — wire motion

**Files:**
- Modify: `apps/web/src/lib/styles/atmosphere.css` (add `@keyframes`
  for ambient drift, glow-pad drift, spec-dot translate)
- Modify: `apps/web/src/lib/components/atmosphere/AtmosphereShell.svelte`
  (replace static placeholders with live elements; inline SVG
  `feTurbulence` filter)

**Interfaces:**

Atmosphere CSS adds:
- `@keyframes atmosphere-ambient-drift` — 90s linear, `translate3d`
  + scale 1 → 1.05 → 1 on the ambient layer.
- `@keyframes atmosphere-glow-drift` — 16s linear, randomized
  `translate3d` ranges (use CSS custom props per pad).
- `@keyframes atmosphere-spec-dot` — 12s linear, `translate3d` +
  opacity yoyo.
- `@media (prefers-reduced-motion: reduce)` — strip all
  `@keyframes` per ADR 0009 strategy. If the strategy is "soft," only
  strip the ambient-drift and glow-drift; keep one signature beat.

AtmosphereShell renders:
- An inline `<svg>` with `<filter id="atmosphere-turbulence">`
  containing `<feTurbulence baseFrequency="0.006" numOctaves="2">` +
  `<feDisplacementMap>`. The ambient layer references it via `filter:
  url(#atmosphere-turbulence)`.
- 3 glow pads (was 1 in Phase 1).
- 12 spec dots (was 4 in Phase 1).
- The cursor halo div from Task 1.

**Mobile fallback:**
- Detect `(max-width: 768px)` in CSS — strip the `feTurbulence` filter
  and apply a baked PNG background via `background-image`.
- Reduce spec dot count to 4-6 on mobile (CSS `:nth-child(n+5) {
  display: none; }`).
- Reduce `backdrop-filter` blur radius from 8px to 4px on mobile.

**Tests:**
- Test that AtmosphereShell renders 12 spec dots on desktop viewport
  (use jsdom + `window.matchMedia` mock).
- Test that AtmosphereShell renders ≤6 spec dots on mobile viewport.

**Steps:**

- [ ] **Step 1:** Add keyframes to `atmosphere.css`. Add
  reduced-motion media query per ADR 0009.
- [ ] **Step 2:** Update `AtmosphereShell.svelte` — inline SVG filter,
  3 glow pads, 12 spec dots, mobile breakpoints.
- [ ] **Step 3:** Generate or commit a baked PNG of the turbulence
  output (one-time render at 1920×1080, 8% opacity baked in). Save to
  `apps/web/static/atmosphere-ambient-mobile.png`.
- [ ] **Step 4:** Manual visual check at 3 viewport widths: 1440px,
  1024px, 375px. Confirm the mobile fallback kicks in below 768px.
- [ ] **Step 5:** Performance check — open Chrome DevTools Performance
  panel, record 5 seconds of idle on `/`. Confirm no layout thrash
  (only `transform`/`opacity`/`filter` changes), CPU usage <8% on a
  laptop.
- [ ] **Step 6:** check + tests + commit.
  `feat(web): atmosphere stack motion (cinematic-memex-hud phase 2,
  task 12)`.

**Acceptance:**
- AtmosphereShell renders the live ambient motion per spec §2.3.
- Mobile fallback works.
- Reduced-motion users see static atmosphere per ADR 0009.
- No layout thrash in performance recording.

---

## Task 13: State transitions + cinematic memory-load

**Files:**
- Modify: each `*State.svelte` component (apply entrance motion
  actions).
- Create: `apps/web/src/lib/components/motion/CinematicTransition.svelte`
- Modify: `apps/web/src/routes/+page.svelte` (orchestrate the
  extracting → ready cinematic transition).

**Interfaces:**

Each `*State.svelte` applies the entrance motion described in spec §4
via the actions created in Tasks 9-11:
- `IdleState`: `splitLineReveal` on the directive + `scrambleIn` on
  the system labels.
- `ExtractingState`: `scrambleIn` on the URL string; CSS-only
  indeterminate growth on the vertical bar.
- `ExtractErrorState`: `phosphorFlash` on the `// INGEST_FAILED`
  label; `scrambleIn` on the error code.
- `FlaggedState`: `phosphorFlash` on the caveat label;
  `splitLineReveal` on the threat list; `scrambleIn` per row.
- `ReadyState`: `splitLineReveal` on the greeting.

`CinematicTransition`:
```ts
type Props = {
  from: 'extracting';
  to: 'ready';
  /** fires when the transition completes; parent advances state */
  onComplete: () => void;
};
```
- A keyframed orchestration that:
  1. Completes the vertical bar growth.
  2. Collapses the HUD panel via `clip-path` mask sweep + scale + translate.
  3. Simultaneously reveals the chat surface via splitLineReveal of
     the greeting and a `transform: scale(0.96) → scale(1)` of the
     composer.
- Built on a single `gsap.timeline()` to keep the choreography
  deterministic. Reduced-motion users skip the timeline and the
  parent's `onComplete` fires immediately.

`+page.svelte` orchestration:
- Add a `transitioning` flag derived from the state machine.
- When state transitions `extracting → ready`, render
  `<CinematicTransition>` overlaid on the page; the underlying state
  swap is delayed until `onComplete` fires.

**Tests:**
- `CinematicTransition.test.ts`: completion callback fires after the
  timeline finishes; reduced-motion fires immediately.

**Steps:**

- [ ] **Step 1:** Apply entrance actions to each `*State.svelte`. One
  commit per state component to keep changes reviewable.
- [ ] **Step 2:** Red-green for `CinematicTransition`.
- [ ] **Step 3:** Wire `CinematicTransition` into `+page.svelte` for
  the extracting → ready transition.
- [ ] **Step 4:** Manual visual check end-to-end — load `/`, paste a
  URL, watch the cinematic transition resolve into the chat shell.
- [ ] **Step 5:** check + tests + commit.
  `feat(web): state entrance motion + cinematic transition
  (cinematic-memex-hud phase 2, task 13)`.

**Acceptance:**
- Each state's entrance animates per spec §4.
- The extracting → ready transition matches spec §4.2.
- Reduced-motion users get instant state changes with no animation.

---

## Task 14: QA via qa-standard + Phase 2 close-out

**Files:**
- Create: `docs/qa/cases/cinematic-memex-hud.md` (test case plan)
- Create: `docs/qa/reports/2026-MM-DD-cinematic-memex-hud.md`
  (run output)

**Per `qa-standard` skill rules:**
- QA never fixes defects — files them as bd issues.
- QA runs against the deployed Vercel preview, not local dev.

**Test case coverage (drafted in `docs/qa/cases/`):**
1. All five states render correctly via dev-mode override at three
   viewport widths (1440, 1024, 375).
2. URL submission → extracting → ready cinematic transition completes
   without visual artifacts.
3. Tool calls render with differentiated scans for both `grep_doc`
   and `finalize`.
4. Failure / cancellation states (force a fetch error, abort a chat
   stream) render correctly per spec §5.3.
5. Reduced-motion mode (toggle via DevTools `Emulate CSS media
   feature: prefers-reduced-motion`) honors the ADR 0009 strategy.
6. Mobile viewport (375px): atmosphere fallback kicks in, no `feTurbulence`
   chunkiness, blur radius reduced.
7. No console errors on any state or transition.
8. Lighthouse performance score ≥80 on desktop, ≥70 on mobile (the
   atmosphere stack is the budget — confirm no regression).

**Steps:**

- [ ] **Step 1:** Write `docs/qa/cases/cinematic-memex-hud.md`
  enumerating the 8 cases above with exact reproduction steps.
- [ ] **Step 2:** Invoke `qa-standard` skill against the Phase 2 PR's
  Vercel preview URL.
- [ ] **Step 3:** QA agent runs the cases, files defects as bd issues
  with `gate:qa` label.
- [ ] **Step 4:** Implementation agents (separate, dispatched by the
  orchestrator) fix the defects.
- [ ] **Step 5:** Re-run QA. Repeat until clean.
- [ ] **Step 6:** Mark Phase 2 PR ready (`gh pr ready <pr>`).
  Orchestrator merges after `gate:qa` clears.

**Acceptance:**
- `docs/qa/cases/cinematic-memex-hud.md` exists with all 8 cases.
- `docs/qa/reports/2026-MM-DD-cinematic-memex-hud.md` exists with the
  final clean run.
- All `gate:qa` defects resolved.
- Phase 2 PR merged.

---

# Self-review checklist

(Run by the plan author after writing; resolved inline before
finishing.)

**1. Spec coverage:**
- Spec §1 (Vision) → captured in plan goal + architecture.
- Spec §2.1 (Palette) → Task 1.
- Spec §2.2 (Typography) → Task 1.
- Spec §2.3 (Atmosphere stack) → Task 1 (static) + Task 12 (motion).
- Spec §2.4 (Instrumentation vocabulary) → Tasks 2-5 (via HUD primitives).
- Spec §3.1, §3.2 (Easing, Duration tokens) → Task 1.
- Spec §3.3 (Choreography primitives) → Tasks 9, 10, 11.
- Spec §3.4 (Ambient discipline) → Task 12.
- Spec §3.5 (Reduced-motion) → Task 7 (ADR).
- Spec §4 (State-by-state) → Tasks 3, 4, 5 (chrome) + Task 13 (motion).
- Spec §5 (Tool-call choreography) → Task 5 (chrome) + Task 11 (motion).
- Spec §6.1, §6.2 (Stack, tokens) → Task 1 (tokens) + Task 8 (libs).
- Spec §6.3 (Component decomposition) → Tasks 2-5 (matches the
  spec's component table 1:1).
- Spec §6.4 (Untouched) → reinforced in "Untouched" section above.
- Spec §6.5 (Testing posture) → embedded in each task's Tests
  subsection + Task 14 (QA).
- Spec §7 (Rollout) → matches Phase 1 / Phase 2 split.
- Spec §8 (Out of scope) → carried forward into "Untouched" section.

**2. Placeholder scan:** No "TBD", "TODO", or "implement later" in
the plan body. Spec §3.5 TBD is resolved by Task 7 (it's a real
decision gate, not a placeholder).

**3. Type consistency:** State component prop types use the existing
`State` discriminated union from `+page.svelte`. Tool-part types come
from `ai` package's `UIMessage`/`ToolUIPart`. Document type comes
from `@url-cheat-sheet/schemas`. Motion-action params are explicitly
typed per task. No drift between tasks.

**4. Project rule compliance:**
- No verbatim implementation bodies — only signatures + behavior
  descriptions (per ucs-mmj rule).
- All file paths absolute under `apps/web/`.
- TDD discipline preserved at the task level.
- Commit style: conventional (`feat(web): ...`) per recent project
  history.
- Reference sites NOT cited anywhere (per
  [[reference-sites-inspiration-only]] memory).
