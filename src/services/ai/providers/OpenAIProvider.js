export class OpenAIProvider {
    providerId = 'openai';
    label = 'OpenAI';
    getProviderId() {
        return this.providerId;
    }
    getProviderLabel() {
        return this.label;
    }
    getProviderApiKeyEnvVar() {
        return 'OPENAI_API_KEY';
    }
    async createClient(options) {
        const openaiType = options.openaiType;
        // Azure
        if (openaiType === 'azure' || process.env.OPENAI_USE_AZURE === 'true') {
            const { AzureOpenAI } = await import('openai');
            return new AzureOpenAI({
                apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
                endpoint: process.env.AZURE_OPENAI_ENDPOINT || options.baseUrl || '',
                deployment: process.env.AZURE_OPENAI_DEPLOYMENT || options.model || '',
                apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview',
            });
        }
        const { default: OpenAI } = await import('openai');
        // Subscriber mode (ChatGPT Plus via OAuth or subscription key).
        // The API key is resolved by ProviderManager.getApiKeyForProvider() which
        // checks CHATGPT_SUBSCRIPTION_KEY, CHATGPT_SESSION_TOKEN, or stored OAuth tokens.
        if (openaiType === 'subscriber') {
            // For subscriber mode, we default to opencode.ai proxy if no baseURL is provided,
            // as standard api.openai.com does not accept session tokens.
            const baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://opencode.ai/zen/v1';
            return new OpenAI({
                apiKey: options.apiKey,
                baseURL: baseUrl,
            });
        }
        const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
        const baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL;
        return new OpenAI({
            apiKey,
            ...(baseUrl ? { baseURL: baseUrl } : {}),
        });
    }
    async listModels(options) {
        const openaiType = options.openaiType;
        if (openaiType === 'azure' || process.env.OPENAI_USE_AZURE === 'true') {
            return [];
        }
        const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
        const baseUrl = options.baseUrl ??
            process.env.OPENAI_BASE_URL ??
            (openaiType === 'subscriber' ? 'https://opencode.ai/zen/v1' : 'https://api.openai.com/v1');
        if (!apiKey)
            return [];
        try {
            const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
            const modelsUrl = normalizedBaseUrl.endsWith('/models') ? normalizedBaseUrl : `${normalizedBaseUrl}/models`;
            const response = await fetch(modelsUrl, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok)
                return [];
            const data = await response.json();
            if (!data || !Array.isArray(data.data))
                return [];
            return data.data.map((m) => ({
                id: m.id,
                label: m.id,
            }));
        }
        catch (error) {
            console.error('[openai] Failed to list models:', error);
            return [];
        }
    }
}
