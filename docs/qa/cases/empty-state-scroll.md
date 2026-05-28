---
name: empty-state-scroll
feature: ucs-wj9 — phantom viewport scroll on empty states
---

QA case for the per-state `box-sizing: border-box` fix. Every state
component sets `min-height: 100vh` + padding; under default `content-box`
that overflowed the viewport by the padding (128px) and produced a
phantom scrollbar on otherwise-empty screens. The fix must remove the
phantom scroll on all empty states while leaving real overflow scrolling
(long conversation) intact.

Verification is measurement-based: compare `document.documentElement.scrollHeight`
against `window.innerHeight`. The DEV-only `?state=<kind>` override
(tree-shaken out of prod) is used to reach each state's empty layout
directly.

```yaml
name: empty-state-scroll
setup:
  - "run the web dev server (vite dev) so the ?state= override is active (DEV only)"
steps:
  - { action: navigate, target: "/?state=idle" }
  - { action: javascript, target: "document.documentElement.scrollHeight - window.innerHeight" }
  - { action: navigate, target: "/?state=extracting" }
  - { action: javascript, target: "document.documentElement.scrollHeight - window.innerHeight" }
  - { action: navigate, target: "/?state=error" }
  - { action: javascript, target: "document.documentElement.scrollHeight - window.innerHeight" }
  - { action: navigate, target: "/?state=flagged" }
  - { action: javascript, target: "document.documentElement.scrollHeight - window.innerHeight" }
  - { action: navigate, target: "/?state=ready" }
  - { action: javascript, target: "document.documentElement.scrollHeight - window.innerHeight" }
  - { action: javascript, target: "inject a 2000px filler into .ready-state__thread, remeasure, then remove it" }
assertions:
  - "idle: scrollHeight <= innerHeight (no phantom scroll)"
  - "extracting: scrollHeight <= innerHeight"
  - "error: scrollHeight <= innerHeight"
  - "flagged: scrollHeight <= innerHeight"
  - "ready (empty thread): scrollHeight <= innerHeight"
  - "ready with tall content: scrollHeight > innerHeight (real scrolling preserved)"
  - "no console errors"
dataDependencies: []
```
