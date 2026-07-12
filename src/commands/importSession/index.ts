import type { Command } from '../../commands.js';

const importSession: Command = {
  type: 'local-jsx',
  name: 'import-session',
  description: 'Resume a conversation from another CLI (Claude Code, Codex, OpenCode, Gemini)',
  aliases: ['resume-external'],
  argumentHint: '[claude|codex|opencode|gemini]',
  load: () => import('./importSession.js'),
};

export default importSession;
