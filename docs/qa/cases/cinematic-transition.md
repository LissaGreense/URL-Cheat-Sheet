---
name: cinematic-transition
feature: ucs-apq — duplicated/stuck extracting→ready cinematic transition
---

QA case for the cinematic transition fix. Before the fix the
`extracting → ready` handoff rendered `ExtractingState` AND the
`CinematicTransition` overlay simultaneously (stacked/duplicated bars +
a doubled greeting), and could hang on "READING" forever when GSAP's
rAF-driven `onComplete` never fired. The fix makes the two render blocks
mutually exclusive (`&& !transitioning`), removes the overlay's static
greeting (ReadyState owns it), and adds a bounded completion fallback
(timeout + visibilitychange) so the transition always reaches `ready`.

Verification drives a real extraction (a content-bearing URL) through the
transition and inspects the END state plus DOM counts.

```yaml
name: cinematic-transition
setup:
  - "run the web dev server (vite dev)"
  - "a content-bearing URL that extracts successfully (e.g. an RFC HTML page)"
steps:
  - { action: navigate, target: "/" }
  - { action: type, target: "input[type=url]", value: "https://datatracker.ietf.org/doc/html/rfc2324" }
  - { action: submit, target: "form" }
  - { action: wait, target: "5s (allow transition + fallback)" }
  - { action: javascript, target: "probe DOM: .ready-state present? .extracting-state present? greeting count? extracting-bar count? overlay present?" }
assertions:
  - "transition reaches ready (no hang on READING): .ready-state present, .extracting-state absent"
  - "no duplication: extracting-bar count 0 and cinematic overlay absent in end state"
  - "greeting 'URL has been loaded to your memory' appears exactly once"
  - "composer present (ready fully rendered)"
  - "no console errors"
dataDependencies: []
```
