---
name: cross-fade-transition
feature: ucs-52o — extracting→ready cross-fade (replaces cinematic overlay)
---

QA case for the simplified `extracting → ready` transition. The GSAP
cinematic overlay was deleted (it caused duplication, hang, and janky
multi-element motion) and replaced with a Svelte `transition:fade`
cross-fade. The two transitioning branches share a single CSS grid cell
(`.state-stack` / `grid-area: stack`) so they OVERLAP during the fade
instead of stacking — without the grid, both block elements coexist in
flow during the ~250ms fade and the document height doubles (scrollbar
flash + content slide).

Verification is measurement-based via a DOM sampler across the swap.

```yaml
name: cross-fade-transition
setup:
  - "run the web dev server (vite dev)"
  - "a content-bearing URL that extracts successfully (e.g. an RFC HTML page)"
steps:
  - { action: navigate, target: "/" }
  - { action: javascript, target: "arm a 16ms sampler recording max scrollHeight while BOTH .extracting-state and .ready-state are present, then submit the URL" }
  - { action: type, target: "input[type=url]", value: "https://datatracker.ietf.org/doc/html/rfc2324" }
  - { action: submit, target: "form" }
  - { action: wait, target: "7s" }
  - { action: javascript, target: "read sampler; inject 3000px into .ready-state__thread and remeasure; remove it" }
assertions:
  - "during the fade both states overlap (bothPresentSamples > 0) but document scrollHeight stays ~1 viewport (no 2x spike)"
  - "transition reaches ready"
  - "long conversation still scrolls (tall content → scrollHeight > innerHeight)"
  - "empty ready fits one viewport (scrollHeight == innerHeight)"
  - "no console errors"
dataDependencies: []
```
