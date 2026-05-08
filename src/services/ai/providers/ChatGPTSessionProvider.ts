import type { ProviderClient, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js'

export class ChatGPTSessionProvider implements ProviderInterface {
  readonly providerId = 'chatgpt_plus' as const
  readonly label = 'ChatGPT Plus (Responses API)'
  readonly envKey = 'CHATGPT_SUBSCRIPTION_KEY'
  readonly defaultBaseUrl = 'https://api.openai.com'

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
    const apiKey = options.apiKey ?? process.env[this.envKey]

    if (!apiKey) {
      throw new Error(
        `Missing API key for ${this.providerId}. Set ${this.envKey}. ` +
        `Get your subscription key from https://platform.openai.com/settings/organization/overview`,
      )
    }

    const baseUrl = options.baseUrl ?? this.defaultBaseUrl

    const { default: OpenAI } = await import('openai')

    const client = new OpenAI({
      apiKey,
      baseURL: `${baseUrl}/v1`,
    })

    return {
      responses: client.responses,
    }
  }
}
