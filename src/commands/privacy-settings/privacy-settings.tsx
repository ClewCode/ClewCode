import React, { useState } from 'react';
import { Byline } from '../../components/design-system/Byline.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js';
import { Box, Link, Text, useInput } from '../../ink.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';

function PrivacySettingsUI({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const config = getGlobalConfig();
  const [helpImprove, setHelpImprove] = useState(!config.telemetryDisabled);

  React.useEffect(() => {
    logEvent('tengu_privacy_settings_viewed', {});
  }, []);

  useInput((_input, key) => {
    if (key.tab || key.return || _input === ' ') {
      const newValue = !helpImprove;
      setHelpImprove(newValue);
      saveGlobalConfig(current => ({
        ...current,
        telemetryDisabled: !newValue,
      }));
      logEvent('tengu_privacy_setting_toggled', {
        setting: 'help_improve_ai_models' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        state: newValue as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
    }
  });

  const valueComponent = helpImprove ? <Text color="success">true</Text> : <Text color="error">false</Text>;

  return (
    <Dialog
      title="Data privacy"
      color="professionalBlue"
      onCancel={() => {
        const status = helpImprove ? 'true' : 'false';
        onDone(`"Help improve our AI models" set to ${status}.`);
      }}
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <Byline>
            <KeyboardShortcutHint shortcut="Enter/Tab/Space" action="toggle" />
            <KeyboardShortcutHint shortcut="Esc" action="cancel" />
          </Byline>
        )
      }
    >
      <Text>
        Review and manage your privacy settings at <Link url={'https://clew-code.org/settings/privacy'}></Link>
      </Text>

      <Box>
        <Box width={44}>
          <Text bold>Help improve our AI models</Text>
        </Box>
        <Box>{valueComponent}</Box>
      </Box>
    </Dialog>
  );
}

export async function call(onDone: LocalJSXCommandOnDone): Promise<React.ReactNode> {
  return <PrivacySettingsUI onDone={onDone} />;
}
