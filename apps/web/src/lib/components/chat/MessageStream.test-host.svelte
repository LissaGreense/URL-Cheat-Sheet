<!--
  Test-only host for MessageStream. We can't easily stand up a real
  `Chat` instance in jsdom (it relies on the AbstractChat machinery
  + transport), so the host accepts a `chat`-shaped duck-typed object
  with `{ messages, status }`. MessageStream only reads `chat.messages`
  inside the template — so any reactive holder with that field works.
-->
<script lang="ts">
  import MessageStream from './MessageStream.svelte';

  // Loose duck shape — the component reads `chat.messages`, nothing else.
  // Tests assemble synthetic message+part objects without a transport.
  type ChatLike = {
    messages: ReadonlyArray<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      parts: ReadonlyArray<Record<string, unknown>>;
    }>;
  };

  type Props = {
    chat: ChatLike;
    awaitingAssistant: boolean;
  };

  let { chat, awaitingAssistant }: Props = $props();
</script>

<MessageStream chat={chat as any} {awaitingAssistant} />
