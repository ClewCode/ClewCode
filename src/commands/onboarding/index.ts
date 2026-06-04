import type { Command } from '../../commands.js';

const onboardingCommand = {
  type: 'local-jsx',
  name: 'onboarding',
  description: 'Run the interactive onboarding wizard to configure Clew Code',
  load: () => import('./onboarding.js'),
} satisfies Command;

export default onboardingCommand;
