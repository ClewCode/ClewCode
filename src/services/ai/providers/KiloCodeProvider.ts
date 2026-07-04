import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
import type { ProviderId } from './ProviderInterface.js';

export class KiloCodeProvider extends OpenAICompatibleProvider {
  constructor() {
    super('kilocode' as ProviderId, 'KiloCode', 'KILOCODE_API_KEY', 'https://api.kilo.ai/api/gateway');
  }

  protected getExtraHeaders(): Record<string, string> {
    return {
      'HTTP-Referer': 'https://github.com/clew-code/clew-code',
      'X-Title': 'Clew Code',
    };
  }
}
