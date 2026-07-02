import ansis from 'ansis';
import type { LocalCommandCall } from '../../types/command.js';
import { setCwd } from '../../utils/Shell.js';
import { pwd } from '../../utils/cwd.js';

export const call: LocalCommandCall = async (args) => {
  const targetPath = (args ?? '').trim();

  if (!targetPath) {
    return {
      type: 'text',
      value: `Current working directory: ${ansis.bold(pwd())}`,
    };
  }

  try {
    setCwd(targetPath);
    return {
      type: 'text',
      value: `Changed working directory to ${ansis.bold(pwd())}`,
    };
  } catch (error) {
    return {
      type: 'text',
      value: `${ansis.red('Error:')} ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};
