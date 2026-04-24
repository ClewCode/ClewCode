import type {
  ProviderClient,
  ProviderInitOptions,
  ProviderInterface,
  ProviderId,
} from './ProviderInterface.js'

const CHAT_COMPLETIONS_PATH = '/chat/completions'

function getChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, '')
  return normalized.endsWith(CHAT_COMPLETIONS_PATH)
    ? normalized
    : `${normalized}${CHAT_COMPLETIONS_PATH}`
}

export class OpenAICompatibleProvider implements ProviderInterface {
  readonly providerId: ProviderId
  readonly label: string
  readonly envKey: string
  readonly defaultBaseUrl: string

  constructor(
    providerId: ProviderId,
    label: string,
    envKey: string,
    defaultBaseUrl: string,
  ) {
    this.providerId = providerId
    this.label = label
    this.envKey = envKey
    this.defaultBaseUrl = defaultBaseUrl
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
    const apiKey = options.apiKey ?? process.env[this.envKey]
    if (!apiKey) {
      throw new Error(
        `Missing API key for provider ${this.providerId}. Set ${this.envKey}.`,
      )
    }

    const baseUrl =
      options.baseUrl ??
      process.env[`${this.providerId.toUpperCase()}_BASE_URL`] ??
      this.defaultBaseUrl

    return {
      chat: {
        completions: {
          create: async (params: {
            model: string
            messages: unknown
            max_tokens?: number
            temperature?: number
            [key: string]: unknown
          }) => {
            const response = await fetch(getChatCompletionsUrl(baseUrl), {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(params),
            })

            if (!response.ok) {
              const text = await response.text()
              throw new Error(
                `${this.providerId} request failed: ${response.status} ${response.statusText} - ${text}`,
              )
            }

            return response.json()
          },
        },
      },
    }
  }
}
