import type { Command } from '../../commands.js';

const usageCookie: Command = {
  type: 'local',
  name: 'usage-cookie',
  description: 'Store Claude.ai sessionKey for /usage Web API fallback',
  isHidden: false,
  supportsNonInteractive: true,
  load: () => import('./usage-cookie.js'),
};

export default usageCookie;
