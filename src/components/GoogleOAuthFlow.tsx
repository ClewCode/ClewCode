import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useTerminalNotification } from '../ink/useTerminalNotification.js';
import { Box, Link, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import {
  CODE_ASSIST_OAUTH_CLIENT,
  CODE_ASSIST_SCOPES,
  saveGeminiOAuthCreds,
} from '../services/ai/providers/CodeAssistProvider.js';
import { logEvent } from '../services/analytics/index.js';
import { GoogleOAuthService, type GoogleOAuthTokens } from '../services/googleOAuth/index.js';
import { sendNotification } from '../services/notifier.js';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js';
import { Select } from './CustomSelect/select.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import { Spinner } from './Spinner.js';
import TextInput from './TextInput.js';

type Props = {
  onDone(tokens: GoogleOAuthTokens | null): void;
  onCancel?(): void;
  /**
   * Code Assist mode (google-assist provider): authenticates with the Gemini
   * CLI's public OAuth client + cloud-platform scopes and writes the tokens to
   * ~/.gemini/oauth_creds.json (shared with the Gemini CLI) instead of the
   * clew global config. No custom client configuration — the client is fixed.
   */
  codeAssist?: boolean;
};

type LoginMethod = 'browser' | 'headless' | 'reconfigure';

type OAuthStatus =
  | { state: 'select_method' }
  | {
      state: 'configure_credentials';
      step: 'client_id' | 'client_secret';
      tempClientId?: string;
      tempMethod: LoginMethod;
    }
  | { state: 'waiting_for_login'; url: string; method: LoginMethod }
  | { state: 'enter_auth_code' }
  | { state: 'exchanging_token' }
  | { state: 'success'; tokens: GoogleOAuthTokens }
  | { state: 'error'; message: string };

const PASTE_HERE_MSG = 'Paste authorization code here > ';

function SelectMethod({
  onSelect,
  onCancel,
  codeAssist,
}: {
  onSelect: (method: LoginMethod) => void;
  onCancel?: () => void;
  codeAssist?: boolean;
}) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>Select Google OAuth login method:</Text>
      </Box>
      <Select
        options={[
          {
            label: 'Google OAuth Web Login (Recommended)',
            value: 'browser',
            description: 'Complete login in your browser, secure callback automatic',
          },
          {
            label: 'Manual Authorization URL (Headless / Remote)',
            value: 'headless',
            description: 'Open login page manually, paste authorization code',
          },
          // Code Assist uses the fixed Gemini CLI public client — nothing to reconfigure
          ...(codeAssist
            ? []
            : [
                {
                  label: 'Reconfigure Google OAuth Credentials',
                  value: 'reconfigure',
                  description: 'Change your custom Google Cloud Client ID and Secret',
                },
              ]),
        ]}
        visibleOptionCount={codeAssist ? 2 : 3}
        onChange={value => onSelect(value as LoginMethod)}
        onCancel={onCancel}
      />
      <Box marginTop={1}>
        <KeyboardShortcutHint shortcut="Esc" action="cancel" />
      </Box>
    </Box>
  );
}

function ConfigureCredentials({
  step,
  onSubmitClientId,
  onSubmitClientSecret,
  onCancel,
}: {
  step: 'client_id' | 'client_secret';
  onSubmitClientId: (clientId: string) => void;
  onSubmitClientSecret: (clientSecret: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const terminalSize = useTerminalSize();
  const textInputColumns = terminalSize.columns - 5;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="suggestion" bold>
          Setup Your Google Cloud Console OAuth Credentials
        </Text>
      </Box>

      {step === 'client_id' ? (
        <>
          <Box marginBottom={1}>
            <Text dimColor>To authenticate with Google Gemini, you need a custom OAuth Client ID:</Text>
          </Box>
          <Text dimColor>1. Visit https://console.cloud.google.com/</Text>
          <Text dimColor>2. Go to APIs & Services &gt; Credentials</Text>
          <Text dimColor>3. Click "Create Credentials" &gt; "OAuth client ID"</Text>
          <Text dimColor>4. Application Type: Select "Desktop app"</Text>
          <Box marginBottom={1}>
            <Text dimColor>5. Set a name and click "Create". Then copy your Client ID.</Text>
          </Box>

          <Box marginBottom={1}>
            <Text>Enter Google OAuth Client ID:</Text>
          </Box>
          <TextInput
            value={value}
            onChange={val => {
              setValue(val);
              setCursorOffset(val.length);
            }}
            onSubmit={onSubmitClientId}
            onExit={onCancel}
            placeholder="e.g. 12345678-abc.apps.googleusercontent.com"
            focus
            showCursor
            columns={textInputColumns}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
          />
        </>
      ) : (
        <>
          <Box marginBottom={1}>
            <Text dimColor>
              Enter the Google OAuth Client Secret associated with your Client ID. If your Desktop app doesn't require a
              secret or has none, you can leave this empty.
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text>Enter Google OAuth Client Secret (Optional, Enter to skip):</Text>
          </Box>
          <TextInput
            value={value}
            onChange={val => {
              setValue(val);
              setCursorOffset(val.length);
            }}
            onSubmit={onSubmitClientSecret}
            onExit={onCancel}
            placeholder="Optional - Press Enter to skip"
            mask="*"
            focus
            showCursor
            columns={textInputColumns}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
          />
        </>
      )}

      <Box marginTop={1} flexDirection="column">
        <KeyboardShortcutHint shortcut="Enter" action="submit" />
        <KeyboardShortcutHint shortcut="Esc" action="cancel" />
      </Box>
    </Box>
  );
}

function WaitingForLogin({
  url,
  method,
  onSubmitCode,
}: {
  url: string;
  method: LoginMethod;
  onSubmitCode?: (code: string) => void;
}) {
  return (
    <Box flexDirection="column">
      <Text color="warning">Waiting for Google authorization...</Text>
      <Box marginTop={1}>
        <Text dimColor>Please complete authorization in your browser.</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>This window will close automatically after login.</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Authorization URL:</Text>
      </Box>
      <Box marginTop={1} marginBottom={1}>
        {url ? <Link url={url}>{url}</Link> : <Text dimColor>Generating authorization URL…</Text>}
      </Box>
      {method === 'headless' && onSubmitCode && (
        <Box marginTop={1}>
          <Text color="suggestion">
            After authenticating in your browser, copy the code from the success page or redirect URL and enter it.
          </Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection="row" alignItems="center">
        <Spinner />
        <Text dimColor> Waiting for authorization...</Text>
      </Box>
      {method === 'headless' && onSubmitCode && (
        <Box marginTop={1}>
          <KeyboardShortcutHint shortcut="Enter" action="manually enter code" />
        </Box>
      )}
    </Box>
  );
}

function EnterAuthCode({ onSubmit, onCancel }: { onSubmit: (code: string) => void; onCancel?: () => void }) {
  const [authCode, setAuthCode] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const terminalSize = useTerminalSize();
  const textInputColumns = terminalSize.columns - PASTE_HERE_MSG.length - 1;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>Enter Google OAuth Authorization Code:</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Paste the "code" parameter from the redirect page URL</Text>
      </Box>
      <TextInput
        value={authCode}
        onChange={value => {
          setAuthCode(value);
          setCursorOffset(value.length);
        }}
        onSubmit={onSubmit}
        onExit={onCancel}
        placeholder="Paste authorization code here"
        focus
        showCursor
        columns={textInputColumns}
        cursorOffset={cursorOffset}
        onChangeCursorOffset={setCursorOffset}
      />
      <Box marginTop={1} flexDirection="column">
        <KeyboardShortcutHint shortcut="Enter" action="submit" />
        <KeyboardShortcutHint shortcut="Esc" action="cancel" />
      </Box>
    </Box>
  );
}

function ExchangingToken() {
  return (
    <Box flexDirection="row" alignItems="center">
      <Spinner />
      <Text> Authenticating with Google...</Text>
    </Box>
  );
}

function SuccessState() {
  return (
    <Box flexDirection="column">
      <Text color="success">✓ Successfully authenticated with Google Gemini</Text>
      <Box marginTop={1}>
        <KeyboardShortcutHint shortcut="Enter" action="continue" />
      </Box>
    </Box>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Box flexDirection="column">
      <Text color="error">✗ {message}</Text>
      <Box marginTop={1} flexDirection="column">
        <KeyboardShortcutHint shortcut="Enter" action="retry" />
        <KeyboardShortcutHint shortcut="Esc" action="cancel" />
      </Box>
    </Box>
  );
}

export function GoogleOAuthFlow({ onDone, onCancel, codeAssist }: Props): React.ReactNode {
  const terminal = useTerminalNotification();

  const [clientId, setClientId] = useState(() => {
    return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || getGlobalConfig().googleOAuthClientId?.trim() || '';
  });
  const [clientSecret, setClientSecret] = useState(() => {
    return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || getGlobalConfig().googleOAuthClientSecret?.trim() || '';
  });

  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>({ state: 'select_method' });
  const oauthServiceRef = useRef<GoogleOAuthService | null>(null);

  const handleSuccess = useCallback(
    (tokens: GoogleOAuthTokens) => {
      if (codeAssist) {
        // Shared with the Gemini CLI — CodeAssistProvider reads this file.
        saveGeminiOAuthCreds(tokens);
      } else {
        saveGlobalConfig(current => ({
          ...current,
          googleOAuthTokens: tokens,
        }));

        if (tokens.accessToken) {
          process.env.GOOGLE_OAUTH_TOKEN = tokens.accessToken;
        }
      }

      logEvent('google_oauth_success', {});
      sendNotification(
        {
          title: 'Google Login Successful',
          message: 'Google Gemini session authenticated',
          notificationType: 'google_oauth_success',
        },
        terminal,
      );
      onDone(tokens);
    },
    [onDone, terminal, codeAssist],
  );

  const handleManualCodeSubmit = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setOAuthStatus({ state: 'error', message: 'Authorization code is required' });
      return;
    }

    setOAuthStatus({ state: 'exchanging_token' });

    try {
      if (oauthServiceRef.current) {
        oauthServiceRef.current.handleManualAuthCodeInput({
          authorizationCode: trimmed,
          state: '',
        });
      } else {
        throw new Error('No active login flow in progress');
      }
    } catch (error) {
      setOAuthStatus({
        state: 'error',
        message: `Failed to authenticate: ${(error as Error).message}`,
      });
    }
  }, []);

  const startOAuthFlow = useCallback(
    async (method: LoginMethod, customClientId?: string, customClientSecret?: string) => {
      if (method === 'reconfigure') {
        setOAuthStatus({
          state: 'configure_credentials',
          step: 'client_id',
          tempMethod: 'browser',
        });
        return;
      }

      // Code Assist always uses the fixed Gemini CLI public client + scopes —
      // never prompt for custom credentials.
      const activeClientId = codeAssist ? CODE_ASSIST_OAUTH_CLIENT.clientId : customClientId || clientId;
      const activeClientSecret = codeAssist
        ? CODE_ASSIST_OAUTH_CLIENT.clientSecret
        : customClientSecret || clientSecret;

      if (!activeClientId) {
        setOAuthStatus({
          state: 'configure_credentials',
          step: 'client_id',
          tempMethod: method,
        });
        return;
      }

      const svc = new GoogleOAuthService({
        clientId: activeClientId,
        clientSecret: activeClientSecret,
        ...(codeAssist ? { scopes: CODE_ASSIST_SCOPES } : {}),
      });
      oauthServiceRef.current = svc;

      try {
        // Empty until the real PKCE auth URL is generated — never show a bare
        // accounts.google.com link (it has no response_type and Google rejects it).
        setOAuthStatus({
          state: 'waiting_for_login',
          url: '',
          method,
        });

        const tokens = await svc.startOAuthFlow(
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
          message: `OAuth failed: ${(error as Error).message}. Try selecting 'Manual Authorization URL' instead.`,
        });
      } finally {
        svc.cleanup();
        if (oauthServiceRef.current === svc) {
          oauthServiceRef.current = null;
        }
      }
    },
    [clientId, clientSecret, handleSuccess, codeAssist],
  );

  useKeybinding(
    'confirm:no',
    () => {
      oauthServiceRef.current?.cleanup();
      oauthServiceRef.current = null;
      onCancel?.();
    },
    {
      context: 'Confirmation',
      isActive: oauthStatus.state !== 'exchanging_token',
    },
  );

  useKeybinding(
    'confirm:yes',
    () => {
      if (oauthStatus.state === 'error') {
        setOAuthStatus({ state: 'select_method' });
      } else if (oauthStatus.state === 'success') {
        onDone(oauthStatus.tokens);
      }
    },
    {
      context: 'Confirmation',
      isActive: oauthStatus.state === 'error' || oauthStatus.state === 'success',
    },
  );

  // Render based on state using separate components
  if (oauthStatus.state === 'select_method') {
    return <SelectMethod onSelect={startOAuthFlow} onCancel={onCancel} codeAssist={codeAssist} />;
  }

  if (oauthStatus.state === 'configure_credentials') {
    return (
      <ConfigureCredentials
        step={oauthStatus.step}
        onSubmitClientId={val => {
          const trimmed = val.trim();
          if (!trimmed) return;
          setOAuthStatus({
            state: 'configure_credentials',
            step: 'client_secret',
            tempClientId: trimmed,
            tempMethod: oauthStatus.tempMethod,
          });
        }}
        onSubmitClientSecret={val => {
          const secret = val.trim();
          const tempClientId = oauthStatus.tempClientId;
          if (!tempClientId) return;

          saveGlobalConfig(current => ({
            ...current,
            googleOAuthClientId: tempClientId,
            googleOAuthClientSecret: secret,
          }));

          setClientId(tempClientId);
          setClientSecret(secret);

          void startOAuthFlow(oauthStatus.tempMethod, tempClientId, secret);
        }}
        onCancel={onCancel}
      />
    );
  }

  if (oauthStatus.state === 'waiting_for_login') {
    return (
      <WaitingForLogin
        url={oauthStatus.url}
        method={oauthStatus.method}
        onSubmitCode={() => setOAuthStatus({ state: 'enter_auth_code' })}
      />
    );
  }

  if (oauthStatus.state === 'enter_auth_code') {
    return <EnterAuthCode onSubmit={handleManualCodeSubmit} onCancel={onCancel} />;
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
