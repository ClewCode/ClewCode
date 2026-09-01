import type { Command } from '../../types/command.js';

export const repomap: Command = {
  name: 'repomap',
  description: 'View or refresh the codebase AST structural map (Repo Map)',
  type: 'local',
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  handler: async (args, context) => {
    const { default: repomapHandler } = await import('./repomap.js');
    return repomapHandler(args, context);
  },
};
