import { ProviderManager } from '../../services/ai/ProviderManager.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'

export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry'

export function getAPIProvider(): APIProvider {
  return ProviderManager.getInstance().getAnthropicProviderType()
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

export function isFirstPartyAnthropicBaseUrl(): boolean {
  return ProviderManager.getInstance().isFirstPartyAnthropicBaseUrl()
}
