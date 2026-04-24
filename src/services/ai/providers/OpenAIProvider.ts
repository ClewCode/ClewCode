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
    const baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL
    const { default: OpenAI } = await import('openai')

    return new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    })
  }
}
