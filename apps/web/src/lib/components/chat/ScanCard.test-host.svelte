<!--
  Test-only host for ScanCard. Lets the test exercise prop permutations
  (toolName, status, statusTone, ticks, errorGlyph) while passing in a
  fixed snippet children block so we can assert children render below
  the header.
-->
<script lang="ts">
  import ScanCard from './ScanCard.svelte';

  type Props = {
    toolName: string;
    status: string;
    statusTone?: 'normal' | 'alarm' | 'dim';
    ticks?: boolean;
    errorGlyph?: boolean;
  };

  let { toolName, status, statusTone, ticks, errorGlyph }: Props = $props();
</script>

<ScanCard {toolName} {status} {statusTone} {ticks} {errorGlyph}>
  <div data-testid="scan-child">interior</div>
</ScanCard>
