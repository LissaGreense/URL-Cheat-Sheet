<!--
  Streaming-host for MessageStream — drives the component with a
  $state-backed chat whose `messages` array (and nested `parts`) can be
  mutated after mount, mirroring how `@ai-sdk/svelte`'s `Chat` flushes
  SSE chunks into the same message reference (`replaceMessage` against
  `activeResponse.state.message`, with `parts.push(...)` and in-place
  `part.state = ...` mutations between flushes).

  Why a separate host (not the static MessageStream.test-host): the
  ucs-6j9 freeze symptom only surfaces under mutation — static-render
  tests can't catch DOM-reuse footguns from index-keyed `{#each}`
  blocks. This host exposes an imperative `mutate()` callback so tests
  can advance the stream tick-by-tick and assert pill text after each
  step.
-->
<script lang="ts">
  import type { Chat } from '@ai-sdk/svelte';
  import { onMount } from 'svelte';
  import MessageStream from './MessageStream.svelte';

  type MockPart = Record<string, unknown> & { type: string };
  type MockMessage = {
    id: string;
    role: 'user' | 'assistant';
    parts: MockPart[];
  };

  /**
   * Props for the streaming host.
   * @property {MockMessage[]} initialMessages - Initial messages to seed
   *   the chat with. The host wraps them in $state so subsequent
   *   mutations via `mutate` propagate through Svelte's reactivity.
   * @property {(api: { messages: MockMessage[] }) => void | Promise<void>} onMounted -
   *   Called once after the host mounts, with a handle to the live
   *   reactive `messages` array. Tests use this to push new parts,
   *   mutate `part.state`, etc., and then assert against the DOM.
   */
  type Props = {
    initialMessages: MockMessage[];
    onMounted: (api: { messages: MockMessage[] }) => void | Promise<void>;
  };

  import { untrack } from 'svelte';

  const props: Props = $props();

  // The live, mutable chat surface. Deep $state proxies make nested
  // mutations (`messages[0].parts[7].state = '...'`) reactive without
  // requiring the test to reassign the array each tick.
  //
  // `untrack(() => props.initialMessages)` documents that the host
  // deliberately captures the prop's initial value (same pattern as
  // SettingsDrawer.test-host) — re-renders with a different
  // `initialMessages` shouldn't reseed; tests mutate via the handle
  // returned through `onMounted`. This also silences the Svelte 5
  // `state_referenced_locally` warning at build time.
  const chat = $state<{ messages: MockMessage[] }>({
    messages: untrack(() =>
      props.initialMessages.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p })) }))
    )
  });

  onMount(() => {
    void props.onMounted({ messages: chat.messages });
  });
</script>

<!--
  The wider `Chat`-shape cast mirrors the static test-host (see that
  file's script-block comment). The streaming host's mutations exercise
  the reactivity contract the production component depends on.
-->
<MessageStream
  chat={chat as unknown as Pick<Chat, 'messages'> & { status?: Chat['status'] }}
  awaitingAssistant={false}
/>
