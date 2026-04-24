import type { ProviderClient, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js'
import { createAnthropicClient } from '../../api/anthropicClient.js'

export class AnthropicProvider implements ProviderInterface {
  readonly providerId = 'anthropic' as const
  readonly label = 'Anthropic'

  getProviderId() {
    return this.providerId
  }

  getProviderLabel() {
    return this.label
  }

  getProviderApiKeyEnvVar() {
    return 'ANTHROPIC_API_KEY'
  }

  async createClient(options: ProviderInitOptions): Promise<ProviderClient> {
    return createAnthropicClient(options)
  }
}
