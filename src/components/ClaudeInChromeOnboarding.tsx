import React from 'react';
import { logEvent } from 'src/services/analytics/index.js';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- enter to continue
import { Box, Link, Newline, Text, useInput } from '../ink.js';
import { isChromeExtensionInstalled } from '../utils/claudeInChrome/setup.js';
import { saveGlobalConfig } from '../utils/config.js';
import { Dialog } from './design-system/Dialog.js';

const CHROME_EXTENSION_URL = 'https://clew-code.org/chrome';
const CHROME_PERMISSIONS_URL = 'https://clew-code.org/chrome/permissions';

type Props = {
  onDone(): void;
};

export function ClaudeInChromeOnboarding({ onDone }: Props): React.ReactNode {
  const [isExtensionInstalled, setIsExtensionInstalled] = React.useState(false);

  React.useEffect(() => {
    logEvent('tengu_claude_in_chrome_onboarding_shown', {});
    void isChromeExtensionInstalled().then(setIsExtensionInstalled);
    saveGlobalConfig(current => {
      return { ...current, hasCompletedClaudeInChromeOnboarding: true };
    });
  }, []);

  // Handle Enter to continue
  useInput((_input, key) => {
    if (key.return) {
      onDone();
    }
  });

  return (
    <Dialog title="Clew in Chrome (Beta)" onCancel={onDone} color="chromeYellow">
      <Box flexDirection="column" gap={1}>
        <Text>
          Clew in Chrome works with the Chrome extension to let you control your browser directly from Clew Code. You
          can navigate websites, fill forms, capture screenshots, record GIFs, and debug with console logs and network
          requests.
          {!isExtensionInstalled && (
            <>
              <Newline />
              <Newline />
              Requires the Chrome extension. Get started at <Link url={CHROME_EXTENSION_URL} />
            </>
          )}
        </Text>

        <Text dimColor>
          Site-level permissions are inherited from the Chrome extension. Manage permissions in the Chrome extension
          settings to control which sites Clew can browse, click, and type on
          {isExtensionInstalled && (
            <>
              {' '}
              (<Link url={CHROME_PERMISSIONS_URL} />)
            </>
          )}
          .
        </Text>
        <Text dimColor>
          For more info, use{' '}
          <Text bold color="chromeYellow">
            /chrome
          </Text>{' '}
           or visit <Link url="https://clew-code.org/docs/chrome" />
        </Text>
      </Box>
    </Dialog>
  );
}
