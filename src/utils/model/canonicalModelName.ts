import { resolveOverriddenModel } from './modelStrings.js';

/**
 * Pure string-match that strips date/provider suffixes from a first-party model
 * name. Input must already be a 1P-format ID.
 */
export function firstPartyNameToCanonical(name: string): string {
  name = name.toLowerCase();
  if (name.includes('claude-opus-4-7')) return 'claude-opus-4-7';
  if (name.includes('claude-opus-4-8')) return 'claude-opus-4-8';
  if (name.includes('claude-opus-4-6')) return 'claude-opus-4-6';
  if (name.includes('claude-opus-4-5')) return 'claude-opus-4-5';
  if (name.includes('claude-opus-4-1')) return 'claude-opus-4-1';
  if (name.includes('claude-opus-4')) return 'claude-opus-4';
  if (name.includes('claude-sonnet-4-7')) return 'claude-sonnet-4-7';
  if (name.includes('claude-sonnet-5')) return 'claude-sonnet-5';
  if (name.includes('claude-sonnet-4-6')) return 'claude-sonnet-4-6';
  if (name.includes('claude-sonnet-4-5')) return 'claude-sonnet-4-5';
  if (name.includes('claude-sonnet-4')) return 'claude-sonnet-4';
  if (name.includes('claude-haiku-4-5')) return 'claude-haiku-4-5';
  if (name.includes('claude-3-7-sonnet')) return 'claude-3-7-sonnet';
  if (name.includes('claude-3-5-sonnet')) return 'claude-3-5-sonnet';
  if (name.includes('claude-3-5-haiku')) return 'claude-3-5-haiku';
  if (name.includes('claude-3-opus')) return 'claude-3-opus';
  if (name.includes('claude-3-sonnet')) return 'claude-3-sonnet';
  if (name.includes('claude-3-haiku')) return 'claude-3-haiku';

  const match = name.match(/(claude-(\d+-\d+-)?\w+)/);
  return match?.[1] ?? name;
}

/**
 * Maps a provider-specific/full model string to the shorter canonical name.
 */
export function getCanonicalName(fullModelName: string): string {
  return firstPartyNameToCanonical(resolveOverriddenModel(fullModelName));
}
