import type { Command } from '../../commands.js';

const research = {
  type: 'local-jsx',
  name: 'research',
  description: 'Deep source-grounded research across local files, wiki, and memory',
  argumentHint: '<subcommand> [args]',
  supportsNonInteractive: true,
  load: () => import('./research.js'),
} satisfies Command;

export default research;
