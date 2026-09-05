const DEFAULT_GATEWAY_BASE_URL = 'https://api.clew-code.org';

/** Normalize gateway config to a base URL without the version prefix. */
export function normalizeGatewayBaseUrl(configuredUrl?: string): string {
  const trimmed = configuredUrl?.trim() || DEFAULT_GATEWAY_BASE_URL;
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  return withoutTrailingSlash.endsWith('/v1') ? withoutTrailingSlash.slice(0, -3) : withoutTrailingSlash;
}
