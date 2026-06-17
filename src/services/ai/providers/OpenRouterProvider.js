import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    super('openrouter', 'OpenRouter', 'OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1');
  }
  getExtraHeaders() {
    return {
      'HTTP-Referer': 'https://github.com/claude-code',
      'X-Title': 'Claude Code',
    };
  }
}
