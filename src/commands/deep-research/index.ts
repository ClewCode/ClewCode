import type { Command } from '../../commands.js';

const deepResearch = {
  type: 'local-jsx',
  name: 'deep-research',
  description: 'Deep source-grounded parallel research with live TUI progress visualization',
  argumentHint: '<query> [--mode <mode>]',
  supportsNonInteractive: true,
  load: () => import('./deepResearch.js'),
} satisfies Command;

export default deepResearch;
