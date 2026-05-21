/**
 * /daemon command — Manage the 24/7 autonomous daemon.
 *
 * Subcommands:
 *   /daemon start     — Enable and start the autonomous agent
 *   /daemon stop      — Stop the autonomous agent
 *   /daemon status    — Show daemon and task queue status
 *   /daemon restart   — Restart the autonomous agent
 */

import type { Command } from '../../commands.js';

const daemon: Command = {
  type: 'local-jsx',
  name: 'daemon',
  description: 'Manage the 24/7 autonomous agent daemon (start/stop/status)',
  isEnabled: () => true,
  argumentHint: '<start|stop|status|restart>',
  load: () => import('./daemon.js'),
};

export default daemon;
