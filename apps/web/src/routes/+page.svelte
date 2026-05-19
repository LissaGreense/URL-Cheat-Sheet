<script lang="ts">
  import { Chat } from '@ai-sdk/svelte';
  import { DefaultChatTransport } from 'ai';

  const chat = new Chat({
    transport: new DefaultChatTransport({ api: '/api/chat' })
  });

  let input = $state('');

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    chat.sendMessage({ text });
    input = '';
  }
</script>

<main class="container">
  <h1>URL Cheat Sheet — RFC 2324</h1>
  <p class="hint">
    Ask anything about the Hyper Text Coffee Pot Control Protocol. Answers are grounded in the
    bundled RFC 2324 text.
  </p>

  <ol class="messages">
    {#each chat.messages as message (message.id)}
      <li class="message message--{message.role}">
        <span class="role">{message.role}</span>
        {#each message.parts as part, i (i)}
          {#if part.type === 'text'}
            <p class="text">{part.text}</p>
          {:else if part.type?.startsWith('tool-')}
            <details class="tool">
              <summary>tool call: {part.type}</summary>
              <pre>{JSON.stringify(part, null, 2)}</pre>
            </details>
          {/if}
        {/each}
      </li>
    {/each}
  </ol>

  <form onsubmit={onSubmit} class="composer">
    <input
      type="text"
      bind:value={input}
      placeholder="Ask about RFC 2324..."
      aria-label="Message"
      disabled={chat.status === 'streaming' || chat.status === 'submitted'}
    />
    <button type="submit" disabled={!input.trim() || chat.status === 'streaming'}>Send</button>
  </form>
</main>

<style>
  .container {
    max-width: 48rem;
    margin: 2rem auto;
    padding: 0 1rem;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .hint {
    color: #666;
    font-size: 0.9rem;
  }
  .messages {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .message {
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    padding: 0.75rem 1rem;
  }
  .message--user {
    background: #f7f7f7;
  }
  .role {
    display: block;
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    margin-bottom: 0.25rem;
  }
  .text {
    margin: 0;
    white-space: pre-wrap;
  }
  .tool {
    margin-top: 0.5rem;
    font-size: 0.8rem;
  }
  .tool pre {
    background: #f0f0f0;
    padding: 0.5rem;
    overflow-x: auto;
  }
  .composer {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .composer input {
    flex: 1;
    padding: 0.5rem;
    font-size: 1rem;
  }
</style>
