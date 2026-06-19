/**
 * OpenAI Device Code Flow (OAuth 2.0 Device Authorization Grant, RFC 8628).
 *
 * Uses Auth0's device flow on auth0.openai.com so the user authenticates
 * by visiting a URL and entering a short code — no localhost callback server
 * needed. This is the same flow `codex login` uses internally.
 *
 * Flow:
 *   1. POST /oauth/device/code → get device_code + user_code + verification_uri
 *   2. Show user_code + verification_uri to the user
 *   3. POST /oauth/token with grant_type=device_code until user completes
 *      or the code expires.
 */

import { OPENAI_OAUTH_CONFIG } from '../../constants/openaiOAuth.js';
import { logEvent } from '../analytics/index.js';
import type { OpenAIOAuthTokens } from './index.js';

const DEVICE_CODE_URL = 'https://auth0.openai.com/oauth/device/code';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  interval: number;
  expires_in: number;
}

interface TokenPollResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export class OpenAIDeviceFlow {
  private deviceCode: string | null = null;
  private abortController: AbortController | null = null;

  /**
   * Start the device authorization flow.
   *
   * @param onCodeReady  Called with (userCode, verificationUri, verificationUriComplete) so the
   *                     caller can display it to the user.
   * @returns The OAuth tokens once the user completes authorization.
   */
  async startDeviceFlow(
    onCodeReady: (userCode: string, verificationUri: string, verificationUriComplete?: string) => void,
  ): Promise<OpenAIOAuthTokens> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // ── Step 1: Request device code ──────────────────────────────────
    const deviceResponse = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: OPENAI_OAUTH_CONFIG.CLIENT_ID,
        scope: OPENAI_OAUTH_CONFIG.SCOPES.join(' '),
      }),
      signal,
    });

    if (!deviceResponse.ok) {
      const body = await deviceResponse.text().catch(() => '');
      throw new Error(`Failed to request device code (${deviceResponse.status}): ${body}`);
    }

    const deviceData: DeviceCodeResponse = await deviceResponse.json();
    this.deviceCode = deviceData.device_code;

    // Notify the caller with the code + URL
    onCodeReady(deviceData.user_code, deviceData.verification_uri, deviceData.verification_uri_complete);

    // ── Step 2: Poll for authorization ───────────────────────────────
    return this.pollForToken(deviceData.interval, deviceData.expires_in, signal);
  }

  /**
   * Poll the token endpoint until the user authorizes or the code expires.
   */
  private async pollForToken(
    interval: number,
    expiresIn: number,
    signal: AbortSignal,
  ): Promise<OpenAIOAuthTokens> {
    const maxTime = Date.now() + expiresIn * 1000;
    const pollInterval = Math.max(interval, 1);  // at least 1s

    while (Date.now() < maxTime) {
      if (signal.aborted) {
        throw new Error('Device flow cancelled');
      }

      try {
        const tokenResponse = await fetch(OPENAI_OAUTH_CONFIG.TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: this.deviceCode,
            client_id: OPENAI_OAUTH_CONFIG.CLIENT_ID,
          }),
          signal,
        });

        const data: TokenPollResponse = await tokenResponse.json();

        // Success
        if (data.access_token) {
          logEvent('openai_device_flow_success', {});
          return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
            scope: data.scope?.split(' ').filter(Boolean),
          };
        }

        // Handle known Auth0 device flow errors
        if (data.error) {
          switch (data.error) {
            case 'authorization_pending':
              // Normal — user hasn't acted yet, keep polling
              break;
            case 'slow_down':
              // Auth0 asks us to increase the interval
              await sleep(pollInterval * 1000);
              continue;
            case 'expired_token':
              throw new Error('Device code expired. Please try again.');
            case 'access_denied':
              throw new Error('Access denied by user.');
            default:
              throw new Error(`OAuth device flow error: ${data.error}${data.error_description ? ` — ${data.error_description}` : ''}`);
          }
        }
      } catch (err) {
        // AbortError is expected on cancellation; re-throw everything else
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error('Device flow cancelled');
        }
        // Network hiccups — retry after interval
      }

      // Wait for the polling interval before trying again
      await sleep(pollInterval * 1000);
    }

    throw new Error('Device flow timed out. Please try again.');
  }

  /** Cancel an in-progress device flow. */
  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.deviceCode = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
