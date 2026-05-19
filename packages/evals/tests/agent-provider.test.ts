import { describe, expect, it } from 'vitest';
import AgentProvider from '../src/providers/agent-provider.ts';

describe('AgentProvider', () => {
  it('round-trips a constructor-supplied id', () => {
    const provider = new AgentProvider({ id: 'custom-id' });
    expect(provider.id()).toBe('custom-id');
  });

  it('falls back to the default id when no constructor argument is supplied', () => {
    const provider = new AgentProvider();
    expect(provider.id()).toBe('url-cheat-sheet:agent');
  });

  it('returns an error naming the missing var when context.vars is empty', async () => {
    const provider = new AgentProvider();
    const result = await provider.callApi('', {
      vars: {},
      prompt: { raw: '', label: '' }
    });
    expect(result.error).toMatch(/kb_url|question/i);
  });
});
