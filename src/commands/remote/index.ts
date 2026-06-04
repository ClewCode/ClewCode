import type { Command } from '../../commands.js';

export default {
  type: 'local',
  name: 'remote',
  description: 'Provider-agnostic Remote Control (WebSocket / relay)',
  argumentHint: 'listen|connect|token [options]',
  supportsNonInteractive: true,
  load: () => import('./remote.js'),
} satisfies Command;
