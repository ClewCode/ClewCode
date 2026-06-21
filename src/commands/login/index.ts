import type { Command } from '../../commands.js';
import { hasAnthropicApiKeyAuth } from '../../utils/auth.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { isGatewayConfigured } from '../../utils/gatewayAuth.js';

const desc = isGatewayConfigured()
  ? 'Sign in to Clew Gateway (api.clew-code.org)'
  : hasAnthropicApiKeyAuth()
    ? 'Switch Anthropic accounts'
    : 'Sign in with your Anthropic account';

export default () =>
  ({
    type: isGatewayConfigured() ? 'local' : 'local-jsx',
    name: 'login',
    description: desc,
    isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGIN_COMMAND),
    load: isGatewayConfigured() ? () => import('./gwlogin.js') : () => import('./login.js'),
  }) satisfies Command;
