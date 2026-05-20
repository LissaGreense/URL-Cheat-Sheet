<!--
  Test-only host for MessageStream. We can't easily stand up a real
  `Chat` instance in jsdom (it relies on the AbstractChat machinery
  + transport), so the host accepts a structural mock matching the
  parts of `Chat` that MessageStream actually reads (`messages` +
  `status`). MessageStream's prop type is narrowed to the same shape
  (`Pick<Chat, 'messages' | 'status'>`) so the forward typechecks
  without a cast.
-->
<script lang="ts">
  import type { Chat } from '@ai-sdk/svelte';
  import MessageStream from './MessageStream.svelte';

  // Structural mock — MessageStream reads `chat.messages` and
  // `chat.status`. Tests assemble synthetic message+part objects
  // without a transport; `status` is optional so empty-thread cases
  // don't have to fabricate a ChatStatus value.
  type ChatMock = Pick<Chat, 'messages'> & { status?: Chat['status'] };

  type Props = {
    chat: ChatMock;
    awaitingAssistant: boolean;
  };

  let { chat, awaitingAssistant }: Props = $props();
</script>

<MessageStream {chat} {awaitingAssistant} />
