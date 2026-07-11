import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { Command } from '../../commands.js';

const STATUSLINE_PROMPT = (args: string) => `Help me set up or update the status line for my Clew Code terminal interface.

Use the "statusline-setup" agent (via the Agent/Task tool with subagent_type "statusline-setup") to make the change — that agent owns the statusLine command in my settings and knows how to convert a shell PS1 and build the JSON.

Steps:
1. Launch the statusline-setup agent.
2. If I did not describe what I want${args?.trim() ? ` (my request: "${args.trim()}")` : ''}, have it try to import my existing shell PS1 configuration. If there is no PS1 to convert, ask me what the status line should show (common options: current directory, git branch/status, model name, output style, context usage %, and 5-hour / 7-day rate-limit usage) before writing anything.
3. Have it write the resulting statusLine command into my Clew Code settings.

After the agent finishes, remind me that I can ask to make further status line changes at any time.`;

const statusline: Command = {
  type: 'prompt',
  name: 'statusline',
  description: 'Set up or update the terminal status line',
  progressMessage: 'setting up your status line',
  argumentHint: '[what to show]',
  contentLength: 0,
  source: 'builtin',
  async getPromptForCommand(args): Promise<ContentBlockParam[]> {
    return [{ type: 'text', text: STATUSLINE_PROMPT(args) }];
  },
};

export default statusline;
