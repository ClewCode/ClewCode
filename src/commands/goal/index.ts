/**
 * Goal command - minimal metadata only.
 * Implementation is lazy-loaded from goal.ts to reduce startup time.
 */
import type { Command } from '../../commands.js';

const goal = {
  type: 'local-jsx',
  name: 'goal',
  description:
    'Set a session goal with autonomous execution. /goal to view, /goal <text|edit|status|clear|pause|resume> to manage',
  immediate: true,
  argumentHint: '[text|edit <new>|status|clear|pause|resume]',
  load: () => import('./goal.js'),
} satisfies Command;

export default goal;
