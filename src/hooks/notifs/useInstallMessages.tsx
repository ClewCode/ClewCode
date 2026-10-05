import { checkInstall } from 'src/utils/nativeInstaller/index.js';
import { useStartupNotification } from './useStartupNotification.js';
export function useInstallMessages() {
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  useStartupNotification(_temp2);
}
async function _temp2() {
  const messages = await checkInstall();
  return messages.map(_temp);
}
function _temp(message: { type: string; userActionRequired?: boolean; message: string }, index: number) {
  let priority = 'low';
  if (message.type === 'error' || message.userActionRequired) {
    priority = 'high';
  } else {
    if (message.type === 'path' || message.type === 'alias') {
      priority = 'medium';
    }
  }
  return {
    key: `install-message-${index}-${message.type}`,
    text: message.message,
    priority,
    color: message.type === 'error' ? 'error' : 'warning',
  };
}
