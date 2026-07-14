import type { Command } from '../../commands.js';

export default {
  type: 'local-jsx',
  name: 'usage',
  description: 'Show plan usage limits',
  // Always selectable. Providers with quota data (Claude AI, Codex/ChatGPT)
  // render usage bars; other providers show a "not available" message rather
  // than hiding the command entirely.
  load: () => import('./usage.js'),
} satisfies Command;
