import { Settings } from '../../components/Settings/Settings.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { execFileNoThrowWithCwd } from '../../utils/execFileNoThrow.js';
export const call: LocalJSXCommandCall = async (onDone, context) => {
  // H36: On Linux, check if terminal flow control is enabled (Ctrl+S
  // would be intercepted by XON/XOFF). If so, attempt to disable it.
  // The clipboard handler in screenshotClipboard.ts also does this, but
  // checking early ensures Ctrl+S works from the first attempt, not just
  // after the first `y` key copy.
  if (process.platform === 'linux') {
    try {
      const { stdout } = await execFileNoThrowWithCwd('stty', ['-a']);
      if (stdout?.includes('ixon')) {
        await execFileNoThrowWithCwd('stty', ['-ixon']);
      }
    } catch {
      // Non-interactive terminal — ignore
    }
  }
  return <Settings onClose={onDone} context={context} defaultTab="Usage" />;
};
