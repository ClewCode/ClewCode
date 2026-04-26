import type { ProviderClient, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js'
import axios from 'axios'

export class CopilotProvider implements ProviderInterface {
  readonly providerId = 'copilot' as const
  readonly label = 'GitHub Copilot'

  getProviderId() {
    return this.providerId
  }

  getProviderLabel() {
    return this.label
  }

  getProviderApiKeyEnvVar() {
    return 'COPILOT_GITHUB_TOKEN'
  }

  async createClient(options: ProviderInitOptions): Promise<ProviderClient> {
    const githubToken = options.apiKey ?? process.env.COPILOT_GITHUB_TOKEN

    // First, exchange GitHub token for a Copilot token
    const tokenResponse = await axios.get('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'User-Agent': 'ClaudeCode'
      }
    })
    
    const copilotToken = tokenResponse.data.token

    // Now create an OpenAI-compatible client pointing to Copilot's proxy
    return {
      createMessage: async (params: any) => {
        const response = await axios.post('https://api.githubcopilot.com/chat/completions', params, {
          headers: {
            'Authorization': `Bearer ${copilotToken}`,
            'Content-Type': 'application/json'
          }
        })
        return response.data
      }
    } as any
  }
}
