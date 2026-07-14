import { setClaudeSessionKey } from '../../services/api/usage.js';
import type { LocalCommandResult } from '../../types/command.js';

export async function call(args: string): Promise<LocalCommandResult> {
  const key = args.trim();

  if (!key || key.length < 10) {
    return {
      type: 'text',
      value: [
        'Usage: /usage-cookie <sessionKey>',
        '',
        'To get your Claude.ai sessionKey:',
        '  1. Open claude.ai in Chrome/Edge/Firefox',
        '  2. Press F12 \u2192 DevTools',
        '     - Chrome/Edge: Application \u2192 Cookies \u2192 claude.ai \u2192 sessionKey',
        '     - Firefox: Storage \u2192 Cookies \u2192 claude.ai \u2192 sessionKey',
        '  3. Copy the Value and run:',
        '     /usage-cookie <paste-value-here>',
        '',
        'The key is stored in secure storage (persists across sessions).',
        'You only need to do this once per machine, unless the cookie expires.',
      ].join('\n'),
    };
  }

  setClaudeSessionKey(key);

  return {
    type: 'text',
    value: '\u2713 Claude.ai sessionKey saved to secure storage. Run /usage to see your usage bars.',
  };
}
