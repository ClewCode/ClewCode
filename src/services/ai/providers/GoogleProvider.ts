import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
import type { ProviderId } from './ProviderInterface.js';

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
}
