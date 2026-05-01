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
    const useVertex = process.env.GOOGLE_USE_VERTEX === 'true'

    if (useVertex) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai')
        // Use projectId from config if provided, otherwise it will try to find it via ADC
        const projectId = (options as any).projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
        return new GoogleGenerativeAI(apiKey || '')
      } catch (e) {
        throw new Error('Vertex AI support requires @google/generative-ai. ' + (e as Error).message)
      }
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required for Google AI Studio')
    }
    return new GoogleGenerativeAI(apiKey)
  }
}
