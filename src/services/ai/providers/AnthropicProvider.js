import { createAnthropicClient } from '../../api/anthropicClient.js';
export class AnthropicProvider {
    providerId = 'anthropic';
    label = 'Anthropic';
    getProviderId() {
        return this.providerId;
    }
    getProviderLabel() {
        return this.label;
    }
    getProviderApiKeyEnvVar() {
        return 'ANTHROPIC_API_KEY';
    }
    async createClient(options) {
        return createAnthropicClient({
            ...options,
            maxRetries: options.maxRetries ?? 2,
        });
    }
    async listModels(options) {
        const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
        if (!apiKey)
            return [];
        try {
            const response = await fetch('https://api.anthropic.com/v1/models', {
                method: 'GET',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
            });
            if (!response.ok)
                return [];
            const data = await response.json();
            if (!data || !Array.isArray(data.data))
                return [];
            return data.data.map((m) => ({
                id: m.id,
                label: m.display_name || m.id,
            }));
        }
        catch (error) {
            console.error('[anthropic] Failed to list models:', error);
            return [];
        }
    }
}
