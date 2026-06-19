import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
import type { ProviderId, ProviderInitOptions } from './ProviderInterface.js';

export class GoogleProvider extends OpenAICompatibleProvider {
  constructor() {
    super(
      'google' as ProviderId,
      'Google',
      'GOOGLE_API_KEY',
      'https://generativelanguage.googleapis.com/v1beta/openai',
      true, // requiresApiKey
    );
  }

  async createClient(options: ProviderInitOptions): Promise<unknown> {
    const googleType = (options as any).googleType;

    // Subscriber mode (Google OAuth Web Login).
    // The OAuth token is resolved by ProviderManager.getApiKeyForProvider()
    // which checks GOOGLE_OAUTH_TOKEN or stored OAuth tokens.
    if (googleType === 'subscriber') {
      const apiKey = options.apiKey ?? process.env.GOOGLE_OAUTH_TOKEN;
      if (!apiKey) {
        throw new Error(
          'Missing Google OAuth token. Use /login or /providers set google to authenticate via OAuth.',
        );
      }
      const baseUrl =
        options.baseUrl ?? process.env.GOOGLE_BASE_URL ?? this.defaultBaseUrl;
      return super.createClient({ ...options, apiKey, baseUrl });
    }

    return super.createClient(options);
  }
}
