import type { Command } from '../../commands.js';
import { hasAnthropicApiKeyAuth } from '../../utils/auth.js';
import { isEnvTruthy } from '../../utils/envUtils.js';

export default () =>
  ({
    type: 'local-jsx',
    name: 'login',
    get description() {
      try {
        return hasAnthropicApiKeyAuth() ? 'Switch Anthropic accounts' : 'Sign in with your Anthropic account';
      } catch {
        return 'Sign in with your Anthropic account';
      }
    },
    isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGIN_COMMAND),
    load: () => import('./login.js'),
  }) satisfies Command;
