import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { Command } from '../../commands.js';
import type { ToolUseContext } from '../../Tool.js';

const loop: Command = {
  type: 'prompt',
  name: 'loop',
  description: 'Schedule a recurring prompt. Usage: /loop [interval] <prompt>',
  progressMessage: 'Scheduling loop…',
  contentLength: 600,
  source: 'builtin',
  allowedTools: ['CronCreate', 'CronList', 'CronDelete'],
  getPromptForCommand: async (args: string, _context: ToolUseContext): Promise<ContentBlockParam[]> => {
    const request = args.trim();
    if (!request) {
      return [
        { type: 'text', text: 'Use /loop [interval] <prompt>, for example: /loop 10m check CI and report failures.' },
      ];
    }
    return [
      {
        type: 'text',
        text: `Schedule a recurring loop for this session. User request: ${request}

Use the CronCreate tool. Convert a leading interval such as 5m, 30m, 2h, or 1d into a valid 5-field local-time cron expression. If no interval is supplied, choose a sensible interval and explain it. Set recurring=true and durable=false unless the user explicitly asks to survive restarts. Preserve the user's prompt as the scheduled prompt. Report the created task ID and cadence.`,
      },
    ];
  },
};

export default loop;
