/**
 * CohereProvider — native Cohere /v2/chat API
 *
 *   POST https://api.cohere.com/v2/chat
 *
 * Not OpenAI-compatible — uses a proprietary endpoint path.
 * Overrides chatPath to /chat instead of /chat/completions.
 */
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
export class CohereProvider extends OpenAICompatibleProvider {
    chatPath = '/chat';
    constructor() {
        super('cohere', 'Cohere', 'COHERE_API_KEY', 'https://api.cohere.com/v2', true);
    }
}
