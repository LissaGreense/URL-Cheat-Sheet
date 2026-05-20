<!--
  Test-only host that wraps AtmosphereShell with a known child node so
  the component test can assert children render above the atmosphere
  layers. Kept colocated with the test it serves.
-->
<script lang="ts">
  import AtmosphereShell from './AtmosphereShell.svelte';
</script>

<AtmosphereShell>
  <div data-testid="atmosphere-child">payload</div>
</AtmosphereShell>
