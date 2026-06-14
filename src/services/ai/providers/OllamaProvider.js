import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
export class OllamaProvider extends OpenAICompatibleProvider {
    constructor() {
        super('ollama', 'Ollama (Local)', 'OLLAMA_API_KEY', 'http://localhost:11434/v1', false);
    }
}
