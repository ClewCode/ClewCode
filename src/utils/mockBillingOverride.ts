/**
 * Mock billing-access override cell for /mock-limits testing.
 *
 * Lives in its own leaf module (no imports) so that both
 * utils/billing.ts (reader) and services/mockRateLimits.ts (writer) can use
 * it without forming an auth → mockRateLimits → billing → auth import cycle.
 */

let mockBillingAccessOverride: boolean | null = null;

export function setMockBillingAccessOverride(value: boolean | null): void {
  mockBillingAccessOverride = value;
}

export function getMockBillingAccessOverride(): boolean | null {
  return mockBillingAccessOverride;
}
