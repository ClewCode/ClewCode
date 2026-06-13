import React, { useCallback, useState } from 'react';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useTerminalNotification } from '../ink/useTerminalNotification.js';
import { Box, Link, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { logEvent } from '../services/analytics/index.js';
import { sendNotification } from '../services/notifier.js';
import { OpenAIOAuthService, type OpenAIOAuthTokens } from '../services/openaiOAuth/index.js';
import { saveGlobalConfig } from '../utils/config.js';
import { Select } from './CustomSelect/select.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import { Spinner } from './Spinner.js';
import TextInput from './TextInput.js';

type Props = {
  onDone(tokens: OpenAIOAuthTokens | null): void;
  onCancel?(): void;
};

type LoginMethod = 'browser' | 'headless' | 'manual';

type OAuthStatus =
  | { state: 'select_method' }
  | { state: 'waiting_for_login'; url: string; method: LoginMethod }
  | { state: 'enter_session_token' }
  | { state: 'exchanging_token' }
  | { state: 'success'; tokens: OpenAIOAuthTokens }
  | { state: 'error'; message: string };

const PASTE_HERE_MSG = 'Paste session token here > ';

// Sub-components to avoid hooks issues with switch statement
function SelectMethod({ onSelect, onCancel }: { onSelect: (method: LoginMethod) => void; onCancel?: () => void }) {
  return (
    <Box flexDirection="column">
      <Text marginBottom={1}>Select ChatGPT Pro/Plus login method:</Text>
      <Select
        options={[
          {
            label: 'OAuth Browser Login (Recommended)',
            value: 'browser',
            description: 'Complete login in your browser, auto-callback',
          },
          {
            label: 'Use Codex CLI login (if installed)',
            value: 'codex',
            description: 'Use existing login from codex login',
          },
          {
            label: 'Manually enter Session Token',
            value: 'manual',
            description: 'Paste your session token from browser cookies',
          },
        ]}
        visibleOptionCount={3}
        onChange={value => onSelect(value as LoginMethod)}
        onCancel={onCancel}
      />
      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <KeyboardShortcutHint shortcut="Esc" />
        <Text dimColor> to cancel</Text>
      </Box>
    </Box>
  );
}

function WaitingForLogin({ url, method }: { url: string; method: LoginMethod }) {
  const [urlCopied, setUrlCopied] = useState(false);

  return (
    <Box flexDirection="column">
      <Text color="yellow">Waiting for authorization...</Text>
      <Box marginTop={1}>
        <Text dimColor>Complete authorization in your browser.</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>This window will close automatically after login.</Text>
      </Box>
      {method === 'headless' && (
        <>
          <Box marginTop={1}>
            <Text>Authorization URL:</Text>
          </Box>
          <Box marginTop={1} marginBottom={1}>
            <Link url={url}>{url}</Link>
          </Box>
          <Box>
            <Text dimColor>{urlCopied ? 'URL copied to clipboard!' : 'Press '}</Text>
            {!urlCopied && <KeyboardShortcutHint shortcut="c" />}
            {!urlCopied && <Text dimColor> to copy URL</Text>}
          </Box>
        </>
      )}
      <Box marginTop={1}>
        <Spinner label="Waiting for authorization" />
      </Box>
    </Box>
  );
}

function EnterSessionToken({ onSubmit, onCancel }: { onSubmit: (token: string) => void; onCancel?: () => void }) {
  const [sessionToken, setSessionToken] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const terminalSize = useTerminalSize();
  const textInputColumns = terminalSize.columns - PASTE_HERE_MSG.length - 1;

  return (
    <Box flexDirection="column">
      <Text marginBottom={1}>Enter your ChatGPT session token:</Text>
      <Text dimColor marginBottom={1}>
        You can find this in your browser cookies (chat.openai.com)
      </Text>
      <TextInput
        value={sessionToken}
        onChange={value => {
          setSessionToken(value);
          setCursorOffset(value.length);
        }}
        onSubmit={onSubmit}
        onExit={onCancel}
        placeholder="Paste session token here"
        mask="*"
        focus
        showCursor
        columns={textInputColumns}
        cursorOffset={cursorOffset}
        onChangeCursorOffset={setCursorOffset}
      />
      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <KeyboardShortcutHint shortcut="Enter" />
        <Text dimColor> to submit or </Text>
        <KeyboardShortcutHint shortcut="Esc" />
        <Text dimColor> to cancel</Text>
      </Box>
    </Box>
  );
}

function ExchangingToken() {
  return (
    <Box>
      <Spinner label="Authenticating with OpenAI..." />
    </Box>
  );
}

function SuccessState() {
  return (
    <Box flexDirection="column">
      <Text color="green">✓ Successfully authenticated with ChatGPT Pro/Plus</Text>
      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <KeyboardShortcutHint shortcut="Enter" />
        <Text dimColor> to continue</Text>
      </Box>
    </Box>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Box flexDirection="column">
      <Text color="red">✗ {message}</Text>
      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <KeyboardShortcutHint shortcut="Enter" />
        <Text dimColor> to retry or </Text>
        <KeyboardShortcutHint shortcut="Esc" />
        <Text dimColor> to cancel</Text>
      </Box>
    </Box>
  );
}

export function OpenAIOAuthFlow({ onDone, onCancel }: Props): React.ReactNode {
  const terminal = useTerminalNotification();
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>({ state: 'select_method' });
  const [oauthService] = useState(() => new OpenAIOAuthService());

  const handleSuccess = useCallback(
    (tokens: OpenAIOAuthTokens) => {
      saveGlobalConfig(current => ({
        ...current,
        openaiOAuthTokens: tokens,
      }));

      if (tokens.accessToken) {
        process.env.CHATGPT_SESSION_TOKEN = tokens.accessToken;
      }

      logEvent('openai_oauth_success', {});
      sendNotification('OpenAI Login Successful', 'ChatGPT Pro/Plus session authenticated');
      onDone(tokens);
    },
    [onDone],
  );

  // Try to load existing Codex auth on mount
  React.useEffect(() => {
    const codexAuth = OpenAIOAuthService.tryLoadFromCodex();
    if (codexAuth?.accessToken) {
      handleSuccess(codexAuth);
    }
  }, [handleSuccess]);

  const handleManualTokenSubmit = useCallback(
    async (token: string) => {
      const trimmed = token.trim();
      if (!trimmed) {
        setOAuthStatus({ state: 'error', message: 'Session token is required' });
        return;
      }

      setOAuthStatus({ state: 'exchanging_token' });

      try {
        const tokens: OpenAIOAuthTokens = {
          accessToken: trimmed,
        };
        handleSuccess(tokens);
      } catch (error) {
        setOAuthStatus({
          state: 'error',
          message: `Failed to authenticate: ${(error as Error).message}`,
        });
      }
    },
    [handleSuccess],
  );

  const startOAuthFlow = useCallback(
    async (method: LoginMethod) => {
      if (method === 'manual') {
        setOAuthStatus({ state: 'enter_session_token' });
        return;
      }

      // Try to use Codex CLI auth
      if (method === 'codex') {
        const codexAuth = OpenAIOAuthService.tryLoadFromCodex();
        if (codexAuth?.accessToken) {
          handleSuccess(codexAuth);
          return;
        }

        setOAuthStatus({
          state: 'waiting_for_login',
          url: 'Run: codex login',
          method: 'headless',
        });

        setOAuthStatus({
          state: 'error',
          message: 'No Codex auth found. Run "npx codex login" or "codex login" first, then come back.',
        });
        return;
      }

      try {
        // Show waiting state immediately
        setOAuthStatus({
          state: 'waiting_for_login',
          url: 'https://chat.openai.com/',
          method,
        });

        const tokens = await oauthService.startOAuthFlow(
          async url => {
            setOAuthStatus({ state: 'waiting_for_login', url, method });
          },
          { skipBrowserOpen: method === 'headless' },
        );
        handleSuccess(tokens);
      } catch (error) {
        console.error('OAuth error:', error);
        setOAuthStatus({
          state: 'error',
          message: `OAuth failed: ${(error as Error).message}. Try selecting 'Manually enter Session Token' instead.`,
        });
      } finally {
        oauthService.cleanup();
      }
    },
    [handleSuccess, oauthService],
  );

  useKeybinding(
    'confirm:no',
    () => {
      oauthService.cleanup();
      onCancel?.();
    },
    {
      context: 'Confirmation',
      isActive: oauthStatus.state !== 'exchanging_token',
    },
  );

  // Render based on state using separate components to avoid hooks issues
  if (oauthStatus.state === 'select_method') {
    return <SelectMethod onSelect={startOAuthFlow} onCancel={onCancel} />;
  }

  if (oauthStatus.state === 'waiting_for_login') {
    return <WaitingForLogin url={oauthStatus.url} method={oauthStatus.method} />;
  }

  if (oauthStatus.state === 'enter_session_token') {
    return <EnterSessionToken onSubmit={handleManualTokenSubmit} onCancel={onCancel} />;
  }

  if (oauthStatus.state === 'exchanging_token') {
    return <ExchangingToken />;
  }

  if (oauthStatus.state === 'success') {
    return <SuccessState />;
  }

  if (oauthStatus.state === 'error') {
    return <ErrorState message={oauthStatus.message} />;
  }

  return null;
}
