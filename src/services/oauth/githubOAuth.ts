// GitHub Device Flow OAuth for Copilot authentication
// Based on GitHub's OAuth Device Flow: https://docs.github.com/en/developers/apps/authorizing-oauth-apps#device-flow
import { logEvent } from '../analytics/index.js';

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_CLIENT_ID = 'Iv1.0a44ff6c9e65d4f1'; // Public client ID for Copilot
const GITHUB_SCOPES = ['read:user', 'workflow'];

export interface GitHubOAuthTokens {
  accessToken: string;
  tokenType?: string;
  scope?: string;
}

export class GitHubOAuthService {
  private deviceCode: string | null = null;
  private userCode: string | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  async startDeviceFlow(onReady: (verificationUri: string, userCode: string) => void): Promise<GitHubOAuthTokens> {
    // Step 1: Request device code
    const deviceResponse = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: GITHUB_SCOPES.join(' '),
      }),
    });

    if (!deviceResponse.ok) {
      throw new Error(`Failed to get device code: ${deviceResponse.status}`);
    }

    const deviceData = await deviceResponse.json();
    this.deviceCode = deviceData.device_code;
    this.userCode = deviceData.user_code;

    // Call onReady with the verification URL and user code
    await onReady(deviceData.verification_uri, this.userCode);

    // Step 2: Poll for authorization
    return this.pollForAuthorization(deviceData.interval);
  }

  private async pollForAuthorization(pollInterval: number = 5): Promise<GitHubOAuthTokens> {
    const maxAttempts = 60; // ~5 minutes max
    let attempts = 0;

    return new Promise((resolve, reject) => {
      this.intervalId = setInterval(async () => {
        attempts++;

        try {
          const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              client_id: GITHUB_CLIENT_ID,
              device_code: this.deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
          });

          const tokenData = await tokenResponse.json();

          if (tokenData.error) {
            if (tokenData.error === 'authorization_pending') {
              // Still waiting, continue polling
              return;
            }
            if (tokenData.error === 'slow_down') {
              // Increase interval
              return;
            }
            if (tokenData.error === 'expired_token') {
              this.cleanup();
              reject(new Error('Device code expired. Please try again.'));
              return;
            }
            if (tokenData.error === 'access_denied') {
              this.cleanup();
              reject(new Error('Access denied by user.'));
              return;
            }
            // Other error
            this.cleanup();
            reject(new Error(`OAuth error: ${tokenData.error}`));
            return;
          }

          // Success!
          this.cleanup();
          logEvent('github_oauth_success', {});

          resolve({
            accessToken: tokenData.access_token,
            tokenType: tokenData.token_type,
            scope: tokenData.scope,
          });
        } catch (error) {
          this.cleanup();
          reject(error);
        }

        if (attempts >= maxAttempts) {
          this.cleanup();
          reject(new Error('Authorization timed out. Please try again.'));
        }
      }, pollInterval * 1000);
    });
  }

  private cleanup(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.deviceCode = null;
    this.userCode = null;
  }
}

// Singleton instance
let instance: GitHubOAuthService | null = null;

export function getGitHubOAuthService(): GitHubOAuthService {
  if (!instance) {
    instance = new GitHubOAuthService();
  }
  return instance;
}
