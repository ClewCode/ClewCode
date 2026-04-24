import type { ProviderClient, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js'

export class GoogleProvider implements ProviderInterface {
  readonly providerId = 'google' as const
  readonly label = 'Google'

  getProviderId() {
    return this.providerId
  }

  getProviderLabel() {
    return this.label
  }

  getProviderApiKeyEnvVar() {
    return 'GOOGLE_API_KEY'
  }

  async createClient(options: ProviderInitOptions): Promise<ProviderClient> {
    const apiKey = options.apiKey ?? process.env.GOOGLE_API_KEY
    const baseUrl = options.baseUrl ?? process.env.GOOGLE_BASE_URL

    const google = (await import('@google/generative-ai')) as any
    const TextServiceClient =
      google.TextServiceClient ?? google.default?.TextServiceClient

    const clientOptions: Record<string, unknown> = {}
    if (apiKey) {
      clientOptions.apiKey = apiKey
    }
    if (baseUrl) {
      clientOptions.apiEndpoint = baseUrl
    }

    return new TextServiceClient(clientOptions)
  }
}
