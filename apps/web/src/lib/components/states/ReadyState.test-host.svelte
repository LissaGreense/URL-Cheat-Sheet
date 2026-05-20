<!--
  Test-only host for ReadyState. Forwards props through so tests can
  exercise the memory chip, the greeting injection, the composer
  binding, and the onReset callback.

  We pass a duck-typed `chat`-shape (with `messages` + `status`) rather
  than a real Chat instance — see MessageStream.test-host.svelte for
  the same pattern.
-->
<script lang="ts">
  import ReadyState from './ReadyState.svelte';

  type ChatLike = {
    messages: ReadonlyArray<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      parts: ReadonlyArray<Record<string, unknown>>;
    }>;
    status?: string;
  };

  type Props = {
    document: { title: string; sourceUrl: string; text: string; headings?: unknown[] };
    chat: ChatLike;
    chatInput: string;
    onSendChat: (e: SubmitEvent) => void;
    onReset: () => void;
  };

  let { document, chat, chatInput = $bindable(''), onSendChat, onReset }: Props = $props();
</script>

<ReadyState document={document as any} chat={chat as any} bind:chatInput {onSendChat} {onReset} />
