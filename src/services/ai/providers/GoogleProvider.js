import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
export class GoogleProvider extends OpenAICompatibleProvider {
  constructor() {
    super('google', 'Google', 'GOOGLE_API_KEY', 'https://generativelanguage.googleapis.com/v1beta/openai', true);
  }
}
