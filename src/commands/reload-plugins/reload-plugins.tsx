import { feature } from 'bun:bundle';
import * as React from 'react';
import { getIsRemoteMode } from '../../bootstrap/state.js';
import ThemedBox from '../../components/design-system/ThemedBox.js';
import { Spinner } from '../../components/Spinner.js';
import { Box, Text } from '../../ink.js';
import { redownloadUserSettings } from '../../services/settingsSync/index.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { refreshActivePlugins } from '../../utils/plugins/refresh.js';
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js';

type ReloadResult = {
  enabled_count: number;
  command_count: number;
  agent_count: number;
  hook_count: number;
  mcp_count: number;
  lsp_count: number;
  error_count: number;
};

type Props = {
  onDone: LocalJSXCommandOnDone;
  context: any;
};

function ReloadDashboard({ onDone, context }: Props): React.ReactNode {
  const [loading, setLoading] = React.useState(true);
  const [result, setResult] = React.useState<ReloadResult | null>(null);

  React.useEffect(() => {
    let isCancelled = false;

    async function performReload() {
      try {
        if (feature('DOWNLOAD_USER_SETTINGS') && (isEnvTruthy(process.env.CLEW_CODE_REMOTE) || getIsRemoteMode())) {
          const applied = await redownloadUserSettings();
          if (applied && !isCancelled) {
            settingsChangeDetector.notifyChange('userSettings');
          }
        }

        const r = await refreshActivePlugins(context.setAppState);
        if (!isCancelled) {
          setResult(r);
          setLoading(false);
          // Auto-done instantly so the interactive prompt is restored
          onDone();
        }
      } catch (error) {
        if (!isCancelled) {
          setLoading(false);
          onDone(`Error during reload: ${(error as Error).message}`);
        }
      }
    }

    performReload();

    return () => {
      isCancelled = true;
    };
  }, [context.setAppState, onDone]);

  if (loading) {
    return (
      <Box flexDirection="row" gap={1} paddingY={1}>
        <Spinner color="permission" />
        <Text color="permission" bold>
          Reloading plugins and environment config...
        </Text>
      </Box>
    );
  }

  if (!result) {
    return (
      <Box paddingY={1}>
        <Text color="error" bold>
          Failed to reload plugins.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <ThemedBox
        borderStyle="round"
        borderColor="permission"
        paddingX={3}
        paddingY={1}
        flexDirection="column"
        width={64}
      >
        {/* Title Header */}
        <Box flexDirection="row" gap={1} marginBottom={1} justifyContent="center">
          <Text color="permission" bold>
            ⚡
          </Text>
          <Text bold> ENVIRONMENT REFRESH COMPLETE </Text>
          <Text color="permission" bold>
            ⚡
          </Text>
        </Box>

        {/* Divider */}
        <Box
          borderStyle="single"
          borderTop={true}
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
          borderColor="permission"
          marginBottom={1}
        />

        {/* Info Grid */}
        <Box flexDirection="row" justifyContent="space-between" width="100%">
          {/* Column 1 */}
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row" gap={1}>
              <Text>🧩</Text>
              <Text bold color="cyan">
                {result.enabled_count}
              </Text>
              <Text dimColor>active plugins</Text>
            </Box>
            <Box flexDirection="row" gap={1}>
              <Text>🤖</Text>
              <Text bold color="yellow">
                {result.agent_count}
              </Text>
              <Text dimColor>custom agents</Text>
            </Box>
            <Box flexDirection="row" gap={1}>
              <Text>🌐</Text>
              <Text bold color="blue">
                {result.mcp_count}
              </Text>
              <Text dimColor>MCP servers</Text>
            </Box>
          </Box>

          {/* Column 2 */}
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="row" gap={1}>
              <Text>✨</Text>
              <Text bold color="magenta">
                {result.command_count}
              </Text>
              <Text dimColor>skills reloaded</Text>
            </Box>
            <Box flexDirection="row" gap={1}>
              <Text>⚓</Text>
              <Text bold color="green">
                {result.hook_count}
              </Text>
              <Text dimColor>hooks attached</Text>
            </Box>
            <Box flexDirection="row" gap={1}>
              <Text>💻</Text>
              <Text bold color="white">
                {result.lsp_count}
              </Text>
              <Text dimColor>LSP servers</Text>
            </Box>
          </Box>
        </Box>

        {/* Error Alert if any */}
        {result.error_count > 0 && (
          <Box marginTop={1} flexDirection="row" gap={1}>
            <Text color="error" bold>
              ⚠
            </Text>
            <Text color="error">
              {result.error_count} error{result.error_count > 1 ? 's' : ''} during load. Run /doctor for details.
            </Text>
          </Box>
        )}
      </ThemedBox>
    </Box>
  );
}

export const call: LocalJSXCommandCall = async (onDone, context) => {
  return <ReloadDashboard onDone={onDone} context={context} />;
};
