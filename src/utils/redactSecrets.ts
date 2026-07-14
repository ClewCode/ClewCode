// Redacts secret-bearing fields (API keys, tokens, auth headers) from objects
// before they are logged or otherwise persisted. Debug logs are written to
// ~/.clew/debug/*.txt and are frequently pasted into bug reports, so any secret
// that reaches them must be assumed compromised.

const REDACTED = '[REDACTED]';

// Keys whose VALUE is a secret. Matched case-insensitively against the full key
// name. `apiKeys` is the provider-config map ({ opengateway: '...', xai: '...' });
// its nested string values are redacted individually by the recursive walk.
const SECRET_KEY_RE =
  /^(api[-_]?keys?|authorization|auth[-_]?token|access[-_]?token|refresh[-_]?token|token|secret|password|client[-_]?secret)$/i;

/**
 * JSON.stringify replacer that masks values under secret-bearing keys, at any
 * depth. A key matching SECRET_KEY_RE has its entire subtree redacted — a plain
 * string becomes `[REDACTED]`, and an object like `apiKeys` has every value
 * replaced while its shape (which providers have keys) is preserved.
 */
export function redactSecretsReplacer(key: string, value: unknown): unknown {
  if (!SECRET_KEY_RE.test(key)) {
    return value;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).map(k => [k, REDACTED]));
  }
  return value === undefined || value === null ? value : REDACTED;
}

/** `JSON.stringify` with secret-bearing fields redacted. Safe for debug logs. */
export function stringifyWithRedactedSecrets(value: unknown): string {
  return JSON.stringify(value, redactSecretsReplacer);
}
