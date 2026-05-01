import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js'
import type { ProviderId, ProviderInitOptions, ProviderClient } from './ProviderInterface.js'

export class KiloCodeProvider extends OpenAICompatibleProvider {
  constructor() {
    super(
      'kilocode' as ProviderId,
      'KiloCode',
      'KILOCODE_API_KEY',
      'https://api.kilo.ai/api/gateway',
    )
  }

  async createClient(options: ProviderInitOptions): Promise<ProviderClient> {
    const apiKey = options.apiKey ?? process.env[this.envKey]
    const baseUrl =
      options.baseUrl ??
      process.env[`${this.providerId.toUpperCase()}_BASE_URL`] ??
      this.defaultBaseUrl

    if (!apiKey) {
      throw new Error(
        `Missing API key for KiloCode. Set ${this.envKey}.`,
      )
    }

    return {
      chat: {
        completions: {
          create: async (params: {
            model: string
            messages: unknown
            max_tokens?: number
            temperature?: number
            stream?: boolean
            [key: string]: unknown
          }) => {
            const isStreaming = params.stream === true
            const response = await fetch(
              `${baseUrl.replace(/\/$/, '')}/chat/completions`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                  'HTTP-Referer': 'https://github.com/claude-code',
                  'X-Title': 'Claude Code',
                },
                body: JSON.stringify({ ...params, stream: isStreaming }),
              },
            )

            if (!response.ok) {
              const text = await response.text()
              throw new Error(
                `KiloCode request failed: ${response.status} ${response.statusText} - ${text}`,
              )
            }

            if (isStreaming) {
              return this.handleStreamingResponse(response)
            }

            const data = await response.json()
            return this.normalizeResponse(data)
          },
        },
      },
    }
  }
}
