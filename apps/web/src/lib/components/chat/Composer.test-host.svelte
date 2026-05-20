<!--
  Test-only host for Composer. Lets the test exercise bindable `value`,
  `disabled`, and `onSubmit` callback behavior. The host forwards the
  binding so tests can read back the value after a typing simulation.
-->
<script lang="ts">
  import Composer from './Composer.svelte';

  type Props = {
    value: string;
    disabled?: boolean;
    placeholder?: string;
    onSubmit: (e: SubmitEvent) => void;
  };

  let { value = $bindable(''), disabled = false, placeholder, onSubmit }: Props = $props();
</script>

<Composer bind:value {disabled} {placeholder} {onSubmit} />
