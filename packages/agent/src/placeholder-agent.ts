/**
 * Self-description of the agent shell.
 *
 * This is a deliberately empty placeholder. Real tools, prompt, and provider
 * configuration land when the URL-Cheat-Sheet app is brainstormed and planned.
 */
export interface AgentInfo {
  name: string;
  version: string;
  tools: string[];
}

export function describeAgent(): AgentInfo {
  return {
    name: 'url-cheat-sheet-agent',
    version: '0.0.0',
    tools: []
  };
}
