/**
 * Auth headers for first-party Anthropic service calls made *outside* the
 * normal API client — policy limits and remote managed settings.
 *
 * Both callers run during settings loading, so this module deliberately does
 * not touch `getSettings()`: `getAnthropicApiKeyWithSource` is called with
 * `skipRetrievingKeyFromApiKeyHelper` so the apiKeyHelper (which reads
 * settings) is never invoked, avoiding a circular dependency.
 */

import { OAUTH_BETA_HEADER } from '../constants/oauth.js';
import { getAnthropicApiKeyWithSource, getClaudeAIOAuthTokens } from '../utils/auth.js';

export type AnthropicAuthHeaders = {
  headers: Record<string, string>;
  error?: string;
};

/**
 * API key first (Console users), then OAuth tokens (Claude.ai users).
 *
 * `getAnthropicApiKeyWithSource` throws in CI/test environments, so the API
 * key probe is wrapped — a throw means "no key", not a failure.
 */
export function getAnthropicAuthHeaders(): AnthropicAuthHeaders {
  try {
    const { key: apiKey } = getAnthropicApiKeyWithSource({
      skipRetrievingKeyFromApiKeyHelper: true,
    });
    if (apiKey) {
      return {
        headers: {
          'x-api-key': apiKey,
        },
      };
    }
  } catch {
    // No API key available - continue to check OAuth
  }

  const oauthTokens = getClaudeAIOAuthTokens();
  if (oauthTokens?.accessToken) {
    return {
      headers: {
        Authorization: `Bearer ${oauthTokens.accessToken}`,
        'anthropic-beta': OAUTH_BETA_HEADER,
      },
    };
  }

  return {
    headers: {},
    error: 'No authentication available',
  };
}
