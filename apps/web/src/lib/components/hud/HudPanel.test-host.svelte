<!--
  Test-only host for HudPanel. Lets the test exercise the four prop
  combinations (corners on/off, ticks on/off, variant default/alarm)
  by switching props via `data-host` attributes from the test.
-->
<script lang="ts">
  import HudPanel from './HudPanel.svelte';

  type Props = {
    corners?: boolean;
    ticks?: boolean;
    variant?: 'default' | 'alarm';
  };

  let { corners = true, ticks = false, variant = 'default' }: Props = $props();
</script>

<HudPanel {corners} {ticks} {variant}>
  <span data-testid="hud-child">payload</span>
</HudPanel>
