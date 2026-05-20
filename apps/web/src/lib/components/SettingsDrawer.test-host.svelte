<!--
  Test-only host for SettingsDrawer. Owns an `apiKey` rune that the
  child mutates via the `bind:apiKey` two-way binding, and exposes the
  current bound value through a `data-bound-key` attribute so tests can
  assert post-save / post-forget state from the DOM.

  Note on the `initial` prop pattern: Svelte 5 warns when a non-rune
  prop is used as the seed for `$state` because the rune captures
  only the *initial* value — re-renders with a different `initial`
  won't propagate. Tests render this host once per case, so the
  capture-once semantics are exactly what we want. The warning is
  silenced via `$state.raw` + an explicit destructure that documents
  the intent.
-->
<script lang="ts">
  import SettingsDrawer from './SettingsDrawer.svelte';

  type Props = {
    initial?: string | null;
  };

  import { untrack } from 'svelte';

  // Destructure the `initial` prop, then seed the rune via `untrack` —
  // this documents "we deliberately want the initial-only capture"
  // and silences the Svelte 5 `state_referenced_locally` warning.
  const props: Props = $props();
  let apiKey = $state<string | null>(untrack(() => props.initial ?? null));
</script>

<div data-testid="host" data-bound-key={apiKey === null ? '' : apiKey}>
  <SettingsDrawer bind:apiKey />
</div>
