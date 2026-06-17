import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
export class KiloCodeProvider extends OpenAICompatibleProvider {
  constructor() {
    super('kilocode', 'KiloCode', 'KILOCODE_API_KEY', 'https://api.kilo.ai/api/gateway');
  }
  getExtraHeaders() {
    return {
      'HTTP-Referer': 'https://github.com/claude-code',
      'X-Title': 'Claude Code',
    };
  }
}
