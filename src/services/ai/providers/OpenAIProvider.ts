import type { ProviderClient, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js'

export class OpenAIProvider implements ProviderInterface {
  readonly providerId = 'openai' as const
  readonly label = 'OpenAI'

  getProviderId() {
    return this.providerId
  }

  getProviderLabel() {
    return this.label
  }

  getProviderApiKeyEnvVar() {
    return 'OPENAI_API_KEY'
  }

  async createClient(options: ProviderInitOptions): Promise<ProviderClient> {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
    const useAzure = process.env.OPENAI_USE_AZURE === 'true'

    if (useAzure) {
      const { AzureOpenAI } = await import('openai')
      return new AzureOpenAI({
        apiKey,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT || options.baseUrl || '',
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT || options.model || '',
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview',
      })
    }

    const { default: OpenAI } = await import('openai')
    const baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL
    return new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    })
  }
}
