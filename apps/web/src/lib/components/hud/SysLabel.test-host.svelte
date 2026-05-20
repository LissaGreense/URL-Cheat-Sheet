<!--
  Test-only host for SysLabel — supplies a snippet child so the test
  can render `kind: 'header'` and `kind: 'action'` variants and assert
  on the `//` / `>` prefix forms.
-->
<script lang="ts">
  import SysLabel from './SysLabel.svelte';

  type Props = {
    kind: 'header' | 'action';
    text?: string;
  };

  let { kind, text = 'MEMORY_BANK' }: Props = $props();
</script>

<SysLabel {kind}>{text}</SysLabel>
