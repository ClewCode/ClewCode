// Google OAuth service for Gemini browser authentication
import { CODE_CHALLENGE_METHOD, GOOGLE_OAUTH_CONFIG } from '../../constants/googleOAuth.js';
import { openBrowser } from '../../utils/browser.js';
import { logEvent } from '../analytics/index.js';
import { AuthCodeListener } from '../oauth/auth-code-listener.js';
import * as crypto from '../oauth/crypto.js';

export interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string[];
}

/**
 * Google OAuth service for handling Google Gemini browser login.
 * Implements OAuth 2.0 authorization code flow with PKCE.
 */
export class GoogleOAuthService {
  private codeVerifier: string;
  private authCodeListener: AuthCodeListener | null = null;
  private port: number | null = null;
  private manualAuthCodeResolver: ((authorizationCode: string) => void) | null = null;
  private clientId: string;
  private clientSecret: string;
  private scopes: readonly string[];

  constructor(options?: { clientId?: string; clientSecret?: string; scopes?: readonly string[] }) {
    this.codeVerifier = crypto.generateCodeVerifier();
    this.clientId = options?.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || GOOGLE_OAUTH_CONFIG.CLIENT_ID;
    this.clientSecret =
      options?.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || GOOGLE_OAUTH_CONFIG.CLIENT_SECRET;
    this.scopes = options?.scopes ?? GOOGLE_OAUTH_CONFIG.SCOPES;
  }

  async startOAuthFlow(
    authURLHandler: (url: string) => Promise<void>,
    options?: {
      skipBrowserOpen?: boolean;
    },
  ): Promise<GoogleOAuthTokens> {
    // Create OAuth callback listener on the loopback IP + /oauth2callback path.
    // Google rejects `localhost` and requires `127.0.0.1`; the path must match
    // the gemini-cli public client's registered redirect (`/oauth2callback`).
    this.authCodeListener = new AuthCodeListener('/oauth2callback', '127.0.0.1');

    // We start the listener on the configured port, or fallback if port is busy
    // To match REDIRECT_URI, we parse the port from GOOGLE_OAUTH_CONFIG.REDIRECT_URI
    const url = new URL(GOOGLE_OAUTH_CONFIG.REDIRECT_URI);
    const configuredPort = Number.parseInt(url.port || '1456', 10);

    this.port = await this.authCodeListener.start(configuredPort);

    // Generate PKCE values and state
    const codeChallenge = crypto.generateCodeChallenge(this.codeVerifier);
    const state = crypto.generateState();

    // Build auth URL
    const authUrl = this.buildAuthUrl({
      codeChallenge,
      state,
      port: this.port,
    });

    // Wait for authorization code
    const authorizationCode = await this.waitForAuthorizationCode(state, async () => {
      await authURLHandler(authUrl);
      if (!options?.skipBrowserOpen) {
        await openBrowser(authUrl);
      }
    });

    const isAutomaticFlow = this.authCodeListener?.hasPendingResponse() ?? false;
    logEvent('google_oauth_auth_code_received', { automatic: isAutomaticFlow });

    try {
      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(authorizationCode, state);

      // Handle success redirect with a beautiful success page served from the local listener
      if (isAutomaticFlow) {
        this.authCodeListener?.handleSuccessRedirect([], res => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Authentication Successful</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                  background-color: #0b0f19;
                  color: #f3f4f6;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                }
                .card {
                  background: rgba(255, 255, 255, 0.03);
                  border: 1px solid rgba(255, 255, 255, 0.08);
                  border-radius: 16px;
                  padding: 40px;
                  text-align: center;
                  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
                  backdrop-filter: blur(10px);
                  max-width: 400px;
                }
                h1 {
                  color: #10b981;
                  margin-top: 0;
                  font-size: 24px;
                }
                p {
                  color: #9ca3af;
                  font-size: 16px;
                  line-height: 1.5;
                }
                .icon {
                  font-size: 48px;
                  color: #10b981;
                  margin-bottom: 20px;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">✓</div>
                <h1>Login Successful!</h1>
                <p>Google Gemini account authenticated successfully. You can close this window now and return to your terminal.</p>
              </div>
            </body>
            </html>
          `);
        });
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

  private buildAuthUrl({ codeChallenge, state, port }: { codeChallenge: string; state: string; port: number }): string {
    const authUrl = new URL(GOOGLE_OAUTH_CONFIG.AUTHORIZE_URL);
    authUrl.searchParams.append('client_id', this.clientId);
    authUrl.searchParams.append('response_type', 'code');
    // For local web callback, standard redirect URI must use local port matched to current server.
    // Must be the loopback IP + /oauth2callback path — Google 400s on `localhost`/other paths.
    authUrl.searchParams.append('redirect_uri', `http://127.0.0.1:${port}/oauth2callback`);
    authUrl.searchParams.append('scope', this.scopes.join(' '));
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', CODE_CHALLENGE_METHOD);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('access_type', 'offline');
    authUrl.searchParams.append('prompt', 'consent');

    return authUrl.toString();
  }

  private async exchangeCodeForTokens(authorizationCode: string, state: string): Promise<GoogleOAuthTokens> {
    const requestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: `http://127.0.0.1:${this.port}/oauth2callback`,
      client_id: this.clientId,
      code_verifier: this.codeVerifier,
      state,
    });

    if (this.clientSecret) {
      requestBody.append('client_secret', this.clientSecret);
    }

    const response = await fetch(GOOGLE_OAUTH_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: requestBody.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token exchange failed (${response.status}): ${error}`);
    }

    const data = await response.json();
    logEvent('google_oauth_token_exchange_success', {});

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
