<!--
  Test-only host for IdleState. Forwards props through so the test can
  exercise different urlInput values and observe onSubmit callbacks.
-->
<script lang="ts">
  import IdleState from './IdleState.svelte';

  type Props = {
    urlInput: string;
    onSubmit: (e: SubmitEvent) => void;
  };

  let { urlInput = $bindable(''), onSubmit }: Props = $props();
</script>

<IdleState bind:urlInput {onSubmit} />
