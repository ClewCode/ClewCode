import { feature } from 'bun:bundle';
import * as React from 'react';
import { resetCostState } from '../../bootstrap/state.js';
import { clearTrustedDeviceToken, enrollTrustedDevice } from '../../bridge/trustedDevice.js';
import type { LocalJSXCommandContext } from '../../commands.js';
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';
import { ConsoleOAuthFlow } from '../../components/ConsoleOAuthFlow.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { GoogleOAuthFlow } from '../../components/GoogleOAuthFlow.js';
import { OpenAIOAuthFlow } from '../../components/OpenAIOAuthFlow.js';
import TextInput from '../../components/TextInput.js';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { Box, Text } from '../../ink.js';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
import { refreshGrowthBookAfterAuthChange } from '../../services/analytics/growthbook.js';
import { refreshPolicyLimits } from '../../services/policyLimits/index.js';
import { refreshRemoteManagedSettings } from '../../services/remoteManagedSettings/index.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { stripSignatureBlocks } from '../../utils/messages.js';
import {
  checkAndDisableAutoModeIfNeeded,
  checkAndDisableBypassPermissionsIfNeeded,
  resetAutoModeGateCheck,
  resetBypassPermissionsCheck,
} from '../../utils/permissions/bypassPermissionsKillswitch.js';
import { resetUserCache } from '../../utils/user.js';

export async function call(onDone: LocalJSXCommandOnDone, context: LocalJSXCommandContext): Promise<React.ReactNode> {
  return (
    <Login
      onDone={async success => {
        context.onChangeAPIKey();
        // Signature-bearing blocks (thinking, connector_text) are bound to the API key —
        // strip them so the new key doesn't reject stale signatures.
        context.setMessages(stripSignatureBlocks);
        if (success) {
          // Post-login refresh logic. Keep in sync with onboarding in src/interactiveHelpers.tsx
          // Reset cost state when switching accounts
          resetCostState();
          // Refresh remotely managed settings after login (non-blocking)
          void refreshRemoteManagedSettings();
          // Refresh policy limits after login (non-blocking)
          void refreshPolicyLimits();
          // Clear user data cache BEFORE GrowthBook refresh so it picks up fresh credentials
          resetUserCache();
          // Refresh GrowthBook after login to get updated feature flags (e.g., for claude.ai MCPs)
          refreshGrowthBookAfterAuthChange();
          // Clear any stale trusted device token from a previous account before
          // re-enrolling — prevents sending the old token on bridge calls while
          // the async enrollTrustedDevice() is in-flight.
          clearTrustedDeviceToken();
          // Enroll as a trusted device for Remote Control (10-min fresh-session window)
          void enrollTrustedDevice();
          // Reset killswitch gate checks and re-run with new org
          resetBypassPermissionsCheck();
          const appState = context.getAppState();
          void checkAndDisableBypassPermissionsIfNeeded(appState.toolPermissionContext, context.setAppState);
          if (feature('TRANSCRIPT_CLASSIFIER')) {
            resetAutoModeGateCheck();
            void checkAndDisableAutoModeIfNeeded(appState.toolPermissionContext, context.setAppState);
          }
          // Increment authVersion to trigger re-fetching of auth-dependent data in hooks (e.g., MCP servers)
          context.setAppState(prev => ({
            ...prev,
            authVersion: prev.authVersion + 1,
          }));
        }
        onDone(success ? 'Login successful' : 'Login interrupted');
      }}
    />
  );
}

export function Login(props: {
  onDone: (success: boolean, mainLoopModel: string) => void;
  startingMessage?: string;
}): React.ReactNode {
  const mainLoopModel = useMainLoopModel();
  const pm = ProviderManager.getInstance();
  const provider = pm.getActiveProviderName();
  const [apiKeyInput, setApiKeyInput] = React.useState('');
  const [cursorOffset, setCursorOffset] = React.useState(0);

  const handleApiKeySubmit = (value: string) => {
    if (value.trim()) {
      try {
        const cfg = pm.getSelectedProviderConfig(true);
        const apiKeys = { ...cfg.apiKeys, [provider]: value.trim() };
        pm.saveSelectedProviderConfig({ ...cfg, apiKeys });
      } catch {
        /* ignore */
      }
      props.onDone(true, mainLoopModel);
    }
  };

  const renderContent = () => {
    if (provider === 'anthropic') {
      return (
        <ConsoleOAuthFlow onDone={() => props.onDone(true, mainLoopModel)} startingMessage={props.startingMessage} />
      );
    }
    if (provider === 'openai') {
      return (
        <OpenAIOAuthFlow
          onDone={() => props.onDone(true, mainLoopModel)}
          onCancel={() => props.onDone(false, mainLoopModel)}
        />
      );
    }
    if (provider === 'google') {
      const config = pm.getSelectedProviderConfig();
      if ((config.providerConfig as any)?.googleType === 'subscriber') {
        return (
          <GoogleOAuthFlow
            onDone={() => props.onDone(true, mainLoopModel)}
            onCancel={() => props.onDone(false, mainLoopModel)}
          />
        );
      }
    }
    if (provider === 'google-assist') {
      // Gemini via Code Assist (OAuth) — browser login with the Gemini CLI's
      // public client; tokens land in ~/.gemini/oauth_creds.json.
      return (
        <GoogleOAuthFlow
          codeAssist
          onDone={() => props.onDone(true, mainLoopModel)}
          onCancel={() => props.onDone(false, mainLoopModel)}
        />
      );
    }
    if (provider === 'ollama') {
      return (
        <Box flexDirection="column" gap={1}>
          <Text>Ollama is a local AI engine and does not require authentication.</Text>
          <Text dimColor>Press Enter to close this screen.</Text>
        </Box>
      );
    }

    let envVarName = 'API_KEY';
    try {
      const pm = ProviderManager.getInstance();
      const pInstance = pm.getProvider(provider);
      envVarName = pInstance.getProviderApiKeyEnvVar();
    } catch {
      envVarName = `${provider.toUpperCase()}_API_KEY`;
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text>Enter your {envVarName} below:</Text>
        <Box borderStyle="round" paddingX={1} width={60}>
          <TextInput
            value={apiKeyInput}
            onChange={value => {
              setApiKeyInput(value);
              setCursorOffset(value.length);
            }}
            onSubmit={handleApiKeySubmit}
            columns={56}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
          />
        </Box>
      </Box>
    );
  };

  return (
    <Dialog
      title={`Login - ${provider.toUpperCase()}`}
      onCancel={() => props.onDone(false, mainLoopModel)}
      color="permission"
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="cancel" />
        )
      }
    >
      {renderContent()}
    </Dialog>
  );
}
