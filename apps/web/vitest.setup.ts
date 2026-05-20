/**
 * Vitest setup — jsdom polyfills.
 *
 * jsdom does not implement `window.matchMedia`. The Phase 2 motion
 * actions (`scrambleIn`, `splitLineReveal`, ...) consult
 * `prefersReducedMotion()` which calls `matchMedia` under the hood, so
 * any component that uses one of those actions (e.g. `StatusPill`)
 * would crash during `render(...)` without this shim.
 *
 * The shim returns `matches: false` by default (motion enabled). Tests
 * that need to assert the reduced-motion path mock the
 * `prefersReducedMotion` helper directly via `vi.mock`, bypassing this
 * polyfill entirely. The polyfill is purely a "doesn't crash" floor.
 *
 * Per the MDN MediaQueryList interface — covering the surface most
 * libraries inspect (matches, media, listeners). All listeners are
 * no-ops; we never fire change events in tests.
 */

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  });
}
