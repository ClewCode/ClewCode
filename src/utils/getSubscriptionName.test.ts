/**
 * Tests for getSubscriptionName() — the single source of truth for the billing
 * label shown in the welcome banner (LogoV2 / CondensedLogo) and /status.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { SubscriptionType } from '../services/oauth/types.js';

let activeProvider = 'anthropic';
let apiProvider = 'firstParty';
let subscriptionType: SubscriptionType | null = null;

// Spread the real modules — mock.module replaces the whole module, and other
// importers still need the exports we are not overriding.
const realProviders = await import('./model/providers.js');
mock.module('src/utils/model/providers.js', () => ({
  ...realProviders,
  getActiveProviderId: () => activeProvider,
  getAPIProvider: () => apiProvider,
}));

// getSubscriptionType() consults the mock-subscription hooks before touching
// OAuth config, so this injects the plan without a real token on disk.
const realMockRateLimits = await import('../services/mockRateLimits.js');
mock.module('../services/mockRateLimits.js', () => ({
  ...realMockRateLimits,
  shouldUseMockSubscription: () => true,
  getMockSubscriptionType: () => subscriptionType,
}));

const { getSubscriptionName } = await import('./auth.js');

describe('getSubscriptionName', () => {
  beforeEach(() => {
    activeProvider = 'anthropic';
    apiProvider = 'firstParty';
    subscriptionType = null;
  });

  test('maps each Claude.ai subscription to its product name', () => {
    const cases: Array<[SubscriptionType, string]> = [
      ['max', 'Claude Max'],
      ['pro', 'Claude Pro'],
      ['team', 'Claude Team'],
      ['enterprise', 'Claude Enterprise'],
    ];
    for (const [type, expected] of cases) {
      subscriptionType = type;
      expect(getSubscriptionName()).toBe(expected);
    }
  });

  test('falls back to Claude API when there is no subscription (API key auth)', () => {
    subscriptionType = null;
    expect(getSubscriptionName()).toBe('Claude API');
  });

  test('names the gateway for Anthropic deployments behind Bedrock/Vertex/Foundry', () => {
    for (const [type, expected] of [
      ['bedrock', 'Bedrock'],
      ['vertex', 'Vertex'],
      ['foundry', 'Foundry'],
    ]) {
      apiProvider = type!;
      expect(getSubscriptionName()).toBe(expected);
    }
  });

  test('labels non-Anthropic providers as "<Provider> API"', () => {
    activeProvider = 'openai';
    expect(getSubscriptionName()).toBe('OpenAI API');
    activeProvider = 'deepseek';
    expect(getSubscriptionName()).toBe('DeepSeek API');
    activeProvider = 'google';
    expect(getSubscriptionName()).toBe('Google API');
  });

  // Regression: provider must be checked before subscription type. Reversing the
  // order labels OpenAI as "Claude API" whenever a Claude token is also present.
  test('does not leak the Claude plan onto a non-Anthropic provider', () => {
    subscriptionType = 'max';
    activeProvider = 'openai';
    expect(getSubscriptionName()).toBe('OpenAI API');
  });
});
