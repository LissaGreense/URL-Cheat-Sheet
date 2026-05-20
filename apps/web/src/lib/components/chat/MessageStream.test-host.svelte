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
  //
  // Why we don't use `Pick<Chat, 'messages'>` here: `Chat['messages']`
  // resolves to `UIMessage[]`, whose `parts` member is the wide
  // `UIMessagePart` discriminated union with mandatory `toolName` /
  // `toolCallId` fields per variant. The tests render lightweight
  // `Record<string, unknown>`-shaped parts that the runtime template
  // happily inspects via duck typing (it only reads `part.type` etc.),
  // but those don't structurally satisfy the union. Modelling the host's
  // own surface with a `MockMessage` shape avoids forcing every test to
  // cast through the wide union. The cast to the wider `Chat`-shape
  // happens at the forward boundary, where it's a sound narrowing for
  // the read-only access MessageStream actually performs.
  type MockMessage = {
    id: string;
    role: 'user' | 'assistant';
    parts: ReadonlyArray<Record<string, unknown>>;
  };
  type ChatMock = {
    messages: ReadonlyArray<MockMessage>;
    status?: Chat['status'];
  };

  type Props = {
    chat: ChatMock;
    awaitingAssistant: boolean;
  };

  let { chat, awaitingAssistant }: Props = $props();
</script>

<!--
  Cast through `unknown` — the mock surface is structurally compatible
  with what MessageStream reads at runtime (each part has a `type`
  string; everything else is duck-typed), but the wider `Chat`-derived
  type isn't satisfied by `Record<string, unknown>` parts at the type
  level. See the script-block comment for context.
-->
<MessageStream
  chat={chat as unknown as Pick<Chat, 'messages'> & { status?: Chat['status'] }}
  {awaitingAssistant}
/>
