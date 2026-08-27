/**
 * Secret scanner and sanitizer for Taste evidence and diffs.
 * Ensures no credentials, API keys, or private tokens leak into the Taste store.
 */

const SECRET_PATTERNS: RegExp[] = [
  // Anthropic / OpenAI / DeepSeek / Google API keys
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
  // GitHub tokens
  /gh[pousr]-[A-Za-z0-9_]{36,}/g,
  // Generic Bearer / JWT tokens
  /Bearer\s+[A-Za-z0-9\-_.=]{20,}/gi,
  /eyJ[A-Za-z0-9-_]{10,}\.eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]+/g,
  // Private keys
  /-----BEGIN\s+[A-Z\s]+PRIVATE\s+KEY-----[\s\S]*?-----END\s+[A-Z\s]+PRIVATE\s+KEY-----/g,
  // Passwords / credentials in env / json
  /(["']?(?:password|secret|apiKey|api_key|token|auth)["']?\s*[:=]\s*["'])([^"'\n\r]{6,})(["'])/gi,
];

export function sanitizeEvidenceText(text?: string | null): string {
  if (!text) return '';

  let sanitized = text;

  // Replace passwords in key-value formats while preserving quotes
  sanitized = sanitized.replace(
    /(["']?(?:password|secret|apiKey|api_key|token|auth)["']?\s*[:=]\s*["'])([^"'\n\r]{6,})(["'])/gi,
    '$1[REDACTED_SECRET]$3',
  );

  // Apply all pattern replacements
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
  }

  return sanitized;
}
