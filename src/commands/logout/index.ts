import type { Command } from '../../commands.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { isGatewayConfigured } from '../../utils/gatewayAuth.js';

export default {
  type: 'local',
  name: 'logout',
  description: isGatewayConfigured() ? 'Sign out from Clew Gateway' : 'Sign out from your Anthropic account',
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGOUT_COMMAND),
  load: isGatewayConfigured() ? () => import('./gwlogout.js') : () => import('./logout.js'),
} satisfies Command;
