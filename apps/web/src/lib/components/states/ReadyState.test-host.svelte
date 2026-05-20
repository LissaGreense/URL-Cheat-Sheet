<!--
  Test-only host for ReadyState. Forwards props through so tests can
  exercise the memory chip, the greeting injection, the composer
  binding, and the onReset callback.

  We pass a structural mock for `chat` (matching the parts ReadyState
  reads — `messages` + `status`) rather than a real Chat instance —
  see MessageStream.test-host.svelte for the same pattern. ReadyState's
  prop is the full `Chat`, so we narrow the host's mock the same way
  as MessageStream and forward to the real component prop. ReadyState
  only reads `chat.messages` + `chat.status`, so the structural surface
  is sufficient at runtime.
-->
<script lang="ts">
  import type { Chat } from '@ai-sdk/svelte';
  import type { Document } from '@url-cheat-sheet/schemas';
  import ReadyState from './ReadyState.svelte';

  // Structural mock — ReadyState reads `chat.messages` + `chat.status`.
  type ChatMock = Pick<Chat, 'messages'> & { status?: Chat['status'] };

  type Props = {
    document: Document;
    chat: ChatMock;
    chatInput: string;
    keySet?: boolean;
    inlineError?: string | null;
    onSendChat: (e: SubmitEvent) => void;
    onReset: () => void;
  };

  let {
    document,
    chat,
    chatInput = $bindable(''),
    keySet,
    inlineError,
    onSendChat,
    onReset
  }: Props = $props();
</script>

<ReadyState {document} {chat} bind:chatInput {keySet} {inlineError} {onSendChat} {onReset} />
