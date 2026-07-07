import type React from 'react';
import { useCallback, useState } from 'react';
import { Box, Text, useInput } from '../../ink.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import { getSettings_DEPRECATED, updateSettingsForSource } from '../../utils/settings/settings.js';
import { Dialog } from '../design-system/Dialog.js';

type Props = {
  onDone(): void;
};

export function SearchApiKeysDialog({ onDone }: Props): React.ReactNode {
  const settings = getSettings_DEPRECATED() || {};
  const env = settings.env || {};

  const [tavilyKey, setTavilyKey] = useState(env.TAVILY_API_KEY || '');
  const [braveKey, setBraveKey] = useState(env.BRAVE_API_KEY || '');
  const [jinaKey, setJinaKey] = useState(env.JINA_API_KEY || '');
  const [focusedField, setFocusedField] = useState<'tavily' | 'brave' | 'jina' | 'buttons'>('tavily');
  const [showTavily, setShowTavily] = useState(false);
  const [showBrave, setShowBrave] = useState(false);
  const [showJina, setShowJina] = useState(false);

  const handleSave = useCallback(() => {
    // Update settings with new API keys and URLs
    const newEnv = {
      ...env,
      ...(tavilyKey.trim() && { TAVILY_API_KEY: tavilyKey.trim() }),
      ...(braveKey.trim() && { BRAVE_API_KEY: braveKey.trim() }),
      ...(jinaKey.trim() && { JINA_API_KEY: jinaKey.trim() }),
    };

    // Remove keys if empty
    if (!tavilyKey.trim()) {
      delete newEnv.TAVILY_API_KEY;
    }
    if (!braveKey.trim()) {
      delete newEnv.BRAVE_API_KEY;
    }
    if (!jinaKey.trim()) {
      delete newEnv.JINA_API_KEY;
    }

    updateSettingsForSource('userSettings', {
      env: newEnv,
    });

    logEvent('tengu_search_api_keys_updated', {
      hasTavily: String(!!tavilyKey.trim()) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      hasBrave: String(!!braveKey.trim()) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    onDone();
  }, [tavilyKey, braveKey, jinaKey, env, onDone]);

  const handleCancel = useCallback(() => {
    logEvent('tengu_search_api_keys_cancelled', {});
    onDone();
  }, [onDone]);

  useInput((input, key) => {
    if (key.tab) {
      // Cycle through fields
      if (focusedField === 'tavily') {
        setFocusedField('brave');
      } else if (focusedField === 'brave') {
        setFocusedField('jina');
      } else if (focusedField === 'jina') {
        setFocusedField('buttons');
      } else {
        setFocusedField('tavily');
      }
      return;
    }

    if (key.return && focusedField === 'buttons') {
      handleSave();
      return;
    }

    if (key.escape) {
      handleCancel();
      return;
    }

    // Handle character input for text fields
    if (focusedField === 'tavily' || focusedField === 'brave' || focusedField === 'jina') {
      let setter: (value: string) => void;
      let current: string;

      if (focusedField === 'tavily') {
        setter = setTavilyKey;
        current = tavilyKey;
      } else if (focusedField === 'brave') {
        setter = setBraveKey;
        current = braveKey;
      } else {
        setter = setJinaKey;
        current = jinaKey;
      }

      if (key.backspace || key.delete) {
        setter(current.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setter(current + input);
      }
    }
  });

  const maskKey = (key: string, show: boolean): string => {
    if (!key) return '(not set)';
    if (show) return key;
    return '*'.repeat(Math.min(key.length, 20));
  };

  return (
    <Dialog title="Search Configuration" onEscape={handleCancel}>
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Text dimColor>Configure search providers for inResearch. Priority: Tavily → Brave → Jina → DuckDuckGo.</Text>

        <Box flexDirection="column" marginY={1}>
          {/* Tavily API Key */}
          <Box flexDirection="column" marginBottom={1}>
            <Text bold={focusedField === 'tavily'} color={focusedField === 'tavily' ? 'suggestion' : undefined}>
              {focusedField === 'tavily' ? '> ' : '  '}Tavily API Key (optional)
              {tavilyKey && ' (set)'}
            </Text>
            <Box marginLeft={2}>
              <Text dimColor={!tavilyKey}>{maskKey(tavilyKey, showTavily)}</Text>
              {tavilyKey && (
                <Text dimColor onPress={() => setShowTavily(!showTavily)}>
                  {' '}
                  [{showTavily ? 'hide' : 'show'}]
                </Text>
              )}
            </Box>
            {focusedField === 'tavily' && (
              <Text dimColor marginLeft={2}>
                Type to enter key • Backspace to delete • Tab to move
              </Text>
            )}
          </Box>

          {/* Brave API Key */}
          <Box flexDirection="column" marginBottom={1}>
            <Text bold={focusedField === 'brave'} color={focusedField === 'brave' ? 'suggestion' : undefined}>
              {focusedField === 'brave' ? '> ' : '  '}Brave API Key (optional)
              {braveKey && ' (set)'}
            </Text>
            <Box marginLeft={2}>
              <Text dimColor={!braveKey}>{maskKey(braveKey, showBrave)}</Text>
              {braveKey && (
                <Text dimColor onPress={() => setShowBrave(!showBrave)}>
                  {' '}
                  [{showBrave ? 'hide' : 'show'}]
                </Text>
              )}
            </Box>
            {focusedField === 'brave' && (
              <Text dimColor marginLeft={2}>
                Type to enter key • Backspace to delete • Tab to move
              </Text>
            )}
          </Box>

          {/* Jina API Key */}
          <Box flexDirection="column">
            <Text bold={focusedField === 'jina'} color={focusedField === 'jina' ? 'suggestion' : undefined}>
              {focusedField === 'jina' ? '> ' : '  '}Jina API Key (optional)
              {jinaKey && ' (set)'}
            </Text>
            <Box marginLeft={2}>
              <Text dimColor={!jinaKey}>{maskKey(jinaKey, showJina)}</Text>
              {jinaKey && (
                <Text dimColor onPress={() => setShowJina(!showJina)}>
                  {' '}
                  [{showJina ? 'hide' : 'show'}]
                </Text>
              )}
            </Box>
            {focusedField === 'jina' && (
              <Text dimColor marginLeft={2}>
                Type to enter key • Backspace to delete • Tab to move
              </Text>
            )}
          </Box>
        </Box>

        <Box flexDirection="row" gap={2} marginTop={1}>
          <Text
            bold={focusedField === 'buttons'}
            color={focusedField === 'buttons' ? 'suggestion' : undefined}
            backgroundColor={focusedField === 'buttons' ? 'suggestion' : undefined}
          >
            {focusedField === 'buttons' ? '> ' : '  '}Save
          </Text>
          <Text onPress={handleCancel}>Cancel</Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Tab: switch field • Enter: save • Esc: cancel</Text>
        </Box>
      </Box>
    </Dialog>
  );
}
