import type { LocalCommandCall } from '../../types/command.js';

export const call: LocalCommandCall = async () => {
  const { unlink } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');
  try {
    await unlink(join(homedir(), '.clew', 'gateway.json'));
    process.stdout.write('Logged out.\n');
  } catch {
    process.stdout.write('Not logged in.\n');
  }
};

