import { Text } from '../ink.js';
import { isClaudeAISubscriber } from '../utils/auth.js';
import { isChromeExtensionInstalled, shouldEnableClaudeInChrome } from '../utils/claudeInChrome/setup.js';
import { isRunningOnHomespace } from '../utils/envUtils.js';
import { useStartupNotification } from './notifs/useStartupNotification.js';

function getChromeFlag(): boolean | undefined {
  if (process.argv.includes('--chrome')) {
    return true;
  }
  if (process.argv.includes('--no-chrome')) {
    return false;
  }
  return undefined;
}
export function useChromeExtensionNotification() {
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  useStartupNotification(_temp);
}
async function _temp() {
  const chromeFlag = getChromeFlag();
  if (!shouldEnableClaudeInChrome(chromeFlag)) {
    return null;
  }
  if (process.env.ENABLE_CHROME_MCP !== '1' && !isClaudeAISubscriber()) {
    return {
      key: 'chrome-requires-subscription',
      jsx: <Text color="error">Clew in Chrome requires a valid subscription</Text>,
      priority: 'immediate',
      timeoutMs: 5000,
    };
  }
  const installed = await isChromeExtensionInstalled();
  if (!installed && !isRunningOnHomespace()) {
    return {
      key: 'chrome-extension-not-detected',
      jsx: <Text color="warning">Chrome extension not detected · Please install the extension to proceed</Text>,
      priority: 'immediate',
      timeoutMs: 3000,
    };
  }
  if (chromeFlag === undefined) {
    return {
      key: 'claude-in-chrome-default-enabled',
      text: 'Clew in Chrome enabled \xB7 /chrome',
      priority: 'low',
    };
  }
  return null;
}
