// OpenAI OAuth service for ChatGPT Pro/Plus browser authentication
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { CODE_CHALLENGE_METHOD, OPENAI_OAUTH_CONFIG } from '../../constants/openaiOAuth.js';
import { openBrowser } from '../../utils/browser.js';
import { logEvent } from '../analytics/index.js';
import { AuthCodeListener } from '../oauth/auth-code-listener.js';
import * as crypto from '../oauth/crypto.js';

export { OpenAIDeviceFlow } from './deviceFlow.js';

// Try to load auth from Codex if available
function loadCodexAuth(): OpenAIOAuthTokens | null {
  const possiblePaths = [
    join(homedir(), '.codex', 'auth.json'),
    join(homedir(), '.chatgpt-local', 'auth.json'),
    join(homedir(), '.chatgpt', 'auth.json'),
  ];

  for (const authPath of possiblePaths) {
    try {
      if (existsSync(authPath)) {
        const data = JSON.parse(readFileSync(authPath, 'utf8'));
        if (data.accessToken) {
          return {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: data.expiresAt,
          };
        }
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

export interface OpenAIOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string[];
}

/**
 * OpenAI OAuth service for handling ChatGPT Pro/Plus browser login
 * Implements OAuth 2.0 authorization code flow with PKCE
 */
export class OpenAIOAuthService {
  private codeVerifier: string;
  private authCodeListener: AuthCodeListener | null = null;
  private port: number | null = null;
  private manualAuthCodeResolver: ((authorizationCode: string) => void) | null = null;

  constructor() {
    this.codeVerifier = crypto.generateCodeVerifier();
  }

  /**
   * Try to load auth from existing Codex/ChatGPT local installation
   */
  static tryLoadFromCodex(): OpenAIOAuthTokens | null {
    return loadCodexAuth();
  }

  async startOAuthFlow(
    authURLHandler: (url: string, automaticUrl?: string) => Promise<void>,
    options?: {
      loginHint?: string;
      skipBrowserOpen?: boolean;
    },
  ): Promise<OpenAIOAuthTokens> {
    // Create OAuth callback listener and start it
    this.authCodeListener = new AuthCodeListener();
    this.port = await this.authCodeListener.start();

    // Generate PKCE values and state
    const codeChallenge = crypto.generateCodeChallenge(this.codeVerifier);
    const state = crypto.generateState();

    // Build auth URLs
    const opts = {
      codeChallenge,
      state,
      port: this.port,
      loginHint: options?.loginHint,
    };
    const manualFlowUrl = this.buildAuthUrl({ ...opts, isManual: true });
    const _automaticFlowUrl = this.buildAuthUrl({ ...opts, isManual: true }); // Use manual (platform.openai.com) for both

    // Wait for authorization code
    const authorizationCode = await this.waitForAuthorizationCode(state, async () => {
      // Always use manual flow with platform.openai.com redirect
      await authURLHandler(manualFlowUrl);
      if (!options?.skipBrowserOpen) {
        await openBrowser(manualFlowUrl);
      }
    });

    // Check if automatic flow
    const isAutomaticFlow = this.authCodeListener?.hasPendingResponse() ?? false;
    logEvent('openai_oauth_auth_code_received', { automatic: isAutomaticFlow });

    try {
      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(authorizationCode, state, !isAutomaticFlow);

      // Handle success redirect
      if (isAutomaticFlow) {
        const scopes = tokenResponse.scope ?? [];
        this.authCodeListener?.handleSuccessRedirect(scopes);
      }

      return tokenResponse;
    } catch (error) {
      if (isAutomaticFlow) {
        this.authCodeListener?.handleErrorRedirect();
      }
      throw error;
    } finally {
      this.authCodeListener?.close();
    }
  }

  private buildAuthUrl({
    codeChallenge,
    state,
    port,
    isManual,
    loginHint,
  }: {
    codeChallenge: string;
    state: string;
    port: number;
    isManual: boolean;
    loginHint?: string;
  }): string {
    const authUrl = new URL(OPENAI_OAUTH_CONFIG.AUTHORIZE_URL);
    authUrl.searchParams.append('client_id', OPENAI_OAUTH_CONFIG.CLIENT_ID);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append(
      'redirect_uri',
      isManual ? OPENAI_OAUTH_CONFIG.MANUAL_REDIRECT_URI : `http://localhost:${port}/auth/callback`,
    );
    authUrl.searchParams.append('scope', OPENAI_OAUTH_CONFIG.SCOPES.join(' '));
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', CODE_CHALLENGE_METHOD);
    authUrl.searchParams.append('state', state);

    if (loginHint) {
      authUrl.searchParams.append('login_hint', loginHint);
    }

    // Add Codex-style extra params
    authUrl.searchParams.append(
      'id_token_add_organizations',
      OPENAI_OAUTH_CONFIG.EXTRA_AUTHORIZE_PARAMS.id_token_add_organizations,
    );
    authUrl.searchParams.append(
      'codex_cli_simplified_flow',
      OPENAI_OAUTH_CONFIG.EXTRA_AUTHORIZE_PARAMS.codex_cli_simplified_flow,
    );
    authUrl.searchParams.append('origin', OPENAI_OAUTH_CONFIG.EXTRA_AUTHORIZE_PARAMS.origin);

    return authUrl.toString();
  }

  private async exchangeCodeForTokens(
    authorizationCode: string,
    state: string,
    useManualRedirect: boolean = false,
  ): Promise<OpenAIOAuthTokens> {
    const requestBody: Record<string, string> = {
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: useManualRedirect
        ? OPENAI_OAUTH_CONFIG.MANUAL_REDIRECT_URI
        : `http://localhost:${this.port}/auth/callback`,
      client_id: OPENAI_OAUTH_CONFIG.CLIENT_ID,
      code_verifier: this.codeVerifier,
      state,
    };

    const response = await fetch(OPENAI_OAUTH_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        response.status === 401
          ? 'Authentication failed: Invalid authorization code'
          : `Token exchange failed (${response.status}): ${error}`,
      );
    }

    const data = await response.json();
    logEvent('openai_oauth_token_exchange_success', {});

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      scope: data.scope?.split(' ').filter(Boolean),
    };
  }

  private async waitForAuthorizationCode(state: string, onReady: () => Promise<void>): Promise<string> {
    return new Promise((resolve, reject) => {
      this.manualAuthCodeResolver = resolve;

      this.authCodeListener
        ?.waitForAuthorization(state, onReady)
        .then(authorizationCode => {
          this.manualAuthCodeResolver = null;
          resolve(authorizationCode);
        })
        .catch(error => {
          this.manualAuthCodeResolver = null;
          reject(error);
        });
    });
  }

  handleManualAuthCodeInput(params: { authorizationCode: string; state: string }): void {
    if (this.manualAuthCodeResolver) {
      this.manualAuthCodeResolver(params.authorizationCode);
      this.manualAuthCodeResolver = null;
      this.authCodeListener?.close();
    }
  }

  cleanup(): void {
    this.authCodeListener?.close();
    this.manualAuthCodeResolver = null;
  }
}
