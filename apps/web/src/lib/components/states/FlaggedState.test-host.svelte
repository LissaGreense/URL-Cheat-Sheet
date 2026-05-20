<!--
  Test-only host for FlaggedState. The `preview` prop is the
  ExtractResponse with a non-safe scan; tests pass synthetic preview
  objects to exercise the threat-list and severity-bar contracts.
-->
<script lang="ts">
  import FlaggedState from './FlaggedState.svelte';
  import type { ExtractResponse } from '@url-cheat-sheet/schemas';

  type Props = {
    preview: ExtractResponse;
    onContinue: () => void;
    onReset: () => void;
  };

  let { preview, onContinue, onReset }: Props = $props();
</script>

<FlaggedState {preview} {onContinue} {onReset} />
