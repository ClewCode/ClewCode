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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIlNldHRpbmdzIiwiTG9jYWxKU1hDb21tYW5kQ2FsbCIsImNhbGwiLCJvbkRvbmUiLCJjb250ZXh0Il0sInNvdXJjZXMiOlsidXNhZ2UudHN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIFJlYWN0IGZyb20gJ3JlYWN0J1xuaW1wb3J0IHsgU2V0dGluZ3MgfSBmcm9tICcuLi8uLi9jb21wb25lbnRzL1NldHRpbmdzL1NldHRpbmdzLmpzJ1xuaW1wb3J0IHR5cGUgeyBMb2NhbEpTWENvbW1hbmRDYWxsIH0gZnJvbSAnLi4vLi4vdHlwZXMvY29tbWFuZC5qcydcblxuZXhwb3J0IGNvbnN0IGNhbGw6IExvY2FsSlNYQ29tbWFuZENhbGwgPSBhc3luYyAob25Eb25lLCBjb250ZXh0KSA9PiB7XG4gIHJldHVybiA8U2V0dGluZ3Mgb25DbG9zZT17b25Eb25lfSBjb250ZXh0PXtjb250ZXh0fSBkZWZhdWx0VGFiPVwiVXNhZ2VcIiAvPlxufVxuIl0sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUtBLEtBQUssTUFBTSxPQUFPO0FBQzlCLFNBQVNDLFFBQVEsUUFBUSx1Q0FBdUM7QUFDaEUsY0FBY0MsbUJBQW1CLFFBQVEsd0JBQXdCO0FBRWpFLE9BQU8sTUFBTUMsSUFBSSxFQUFFRCxtQkFBbUIsR0FBRyxNQUFBQyxDQUFPQyxNQUFNLEVBQUVDLE9BQU8sS0FBSztFQUNsRSxPQUFPLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDRCxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQ0MsT0FBTyxDQUFDLENBQUMsVUFBVSxDQUFDLE9BQU8sR0FBRztBQUMzRSxDQUFDIiwiaWdub3JlTGlzdCI6W119
