import type { Command } from '../../commands.js';

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  aliases: ['companion'],
  description: 'Configure your AI companion (Buddy)',
  argumentHint: '[show|hide|setup]',
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  load: () => import('./buddy.tsx'),
} satisfies Command;

export default buddy;
