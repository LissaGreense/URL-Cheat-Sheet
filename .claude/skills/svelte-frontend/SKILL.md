---
name: svelte-frontend
description: Use after `superpowers:test-driven-development` whenever the task touches `apps/web/**` (Svelte 5 + runes). Adds Svelte-specific patterns for state, streaming chat, and testing.
---

# Svelte 5 frontend (runes era)

This skill composes with — does not replace — `superpowers:test-driven-development`.
Write tests first, then apply these patterns.

## State

| Need | Use |
|---|---|
| Component-local mutable | `$state(initial)` |
| Computed from other state | `$derived(expr)` or `$derived.by(() => ...)` |
| Component inputs | `$props()` (with optional Zod validation at the boundary) |
| Side effects | `$effect(() => { ... })` (cleanup via returned fn) |
| Truly cross-component shared state | `writable` from `svelte/store` (only when runes can't reach) |

**Rule:** prefer runes over stores. Reach for `writable` only when the state
must live outside any component tree.

## Streaming chat (Vercel AI SDK v6 + `@ai-sdk/svelte`)

- Server: `+server.ts` returns the result of `streamText(...).toDataStreamResponse()`.
- Client: import `Chat` from `@ai-sdk/svelte`, instantiate it in a `.svelte` file's `<script>`, and bind `chat.messages` reactively.
- Always set `maxSteps` (or `stopWhen`) on `streamText` calls that use tools — otherwise the model calls the tool and never produces final text.

## Testing

- Unit (logic): Vitest 4, `bun --filter @url-cheat-sheet/web test`.
- Component: `@testing-library/svelte` + jsdom.
- Endpoint handlers: import the `GET`/`POST` from `+server.ts` and call directly.
- Don't mock SvelteKit's `json()` helper — it's free to use in tests.

## Common pitfalls

- **`$state` in `.ts` files** requires the `.svelte.ts` extension or it won't compile.
- **`$props()` destructuring** must happen at the top of `<script>`, not inside a function.
- **Vite 8** uses Rolldown — never edit `rollupOptions`, use `rolldownOptions`.
