import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
import type { ProviderId } from './ProviderInterface.js';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    super('openrouter' as ProviderId, 'OpenRouter', 'OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1');
  }

  protected getExtraHeaders(): Record<string, string> {
    return {
      'HTTP-Referer': 'https://github.com/clew-code/clew-code',
      'X-Title': 'Clew Code',
    };
  }
}
