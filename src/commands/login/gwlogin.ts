import type { LocalCommandCall } from '../../types/command.js';

export const call: LocalCommandCall = async (_args, _context) => {
  const { gatewayLogin } = await import('../../cli/handlers/auth.js');
  await gatewayLogin();
};
