import type { Command } from '../../commands.js';

const mode = {
  type: 'local',
  name: 'mode',
  description: 'Switch execution mode: safe, yolo, afk, review-only, browser-safe',
  aliases: ['exec-mode'],
  isEnabled: () => true,
  load: () => import('./modeHandler.js'),
} satisfies Command;

export default mode;
