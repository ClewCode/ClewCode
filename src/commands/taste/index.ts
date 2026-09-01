/**
 * Taste command - metadata and lazy loader.
 */
import type { Command } from '../../commands.js';

const taste = {
  type: 'local',
  name: 'taste',
  description: 'Manage and inspect learned & explicit user/project coding preferences and conventions',
  immediate: true,
  argumentHint: '[list|add <rule>|inspect <id>|disable <id>|enable <id>|remove <id>|clear]',
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  handler: async (args, context) => {
    const mod = await import('./taste.js');
    return mod.default(args, context);
  },
} satisfies Command;

export default taste;
