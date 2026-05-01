import type {
  ProviderClient,
  ProviderInitOptions,
  ProviderInterface,
  ProviderId,
} from './ProviderInterface.js'

export class OpenAIResponsesProvider implements ProviderInterface {
  readonly providerId: ProviderId
  readonly label: string
  readonly envKey: string
  readonly defaultBaseUrl: string
  protected requiresApiKey: boolean

  constructor(
    providerId: ProviderId,
    label: string,
    envKey: string,
    defaultBaseUrl: string,
    requiresApiKey = true,
  ) {
    this.providerId = providerId
    this.label = label
    this.envKey = envKey
    this.defaultBaseUrl = defaultBaseUrl
    this.requiresApiKey = requiresApiKey
  }

  getProviderId() {
    return this.providerId
  }

  getProviderLabel() {
    return this.label
  }

  getProviderApiKeyEnvVar() {
    return this.envKey
  }

  async createClient(options: ProviderInitOptions): Promise<ProviderClient> {
    const apiKey = this.requiresApiKey
      ? (options.apiKey ?? process.env[this.envKey])
      : undefined

    if (this.requiresApiKey && !apiKey) {
      throw new Error(
        `Missing API key for provider ${this.providerId}. Set ${this.envKey}.`,
      )
    }

    const baseUrl =
      options.baseUrl ??
      process.env[`${this.providerId.toUpperCase()}_BASE_URL`] ??
      this.defaultBaseUrl

    const { default: OpenAI } = await import('openai')

    const client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    })

    return {
      responses: client.responses,
    }
  }
}
