import { redactWithScannerRules } from '../services/teamMemorySync/secretScanner.js';

/**
 * Redaction for text on its way into the memory store (see `ingest.ts` and
 * `runs/runWriter.ts`) — memory files persist to disk and sync between
 * machines, so anything secret-shaped must not survive this step.
 *
 * Token-shaped credentials are delegated to the gitleaks-derived rule set in
 * `services/teamMemorySync/secretScanner.ts`, which recognizes ~37 providers.
 * The patterns below cover the two shapes that rule set deliberately does not:
 * generic `NAME = value` config assignments, and database connection strings
 * where only the password component should be removed.
 */
const SECRET_PATTERNS = [
  // Common key-value configs
  /((?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|SECRET|PASSWORD|PASSWORD_HASH|PRIVATE_KEY|API_KEY|JWT_SECRET|DB_PASSWORD)\s*=\s*)(['"]?)([^'"\r\n\s]{8,})(\2)/gi,
  // PostgreSQL/Database URL
  /(mongodb(?:\+srv)?|postgres(?:ql)?|mysql|sqlite):\/\/([^:]+):([^@]+)@([^/]+)\/([^?\r\n\s]+)/gi,
  // Provider key shapes kept locally because they are looser than the scanner's
  // (which requires exact vendor lengths) — a truncated or synthetic key in a
  // transcript should still be redacted before it lands on disk.
  /(sk-ant-[a-zA-Z0-9_-]{32,})/gi,
  /(sk-[a-zA-Z0-9_-]{32,})/gi,
  /(gh[opsu]_[a-zA-Z0-9_-]{36})/gi,
  /(github_pat_[a-zA-Z0-9_-]{82})/gi,
];

export function redactSecrets(text: string): string {
  // Broad, vendor-specific rules first: they match exact key formats, so they
  // clear unambiguous credentials before the looser patterns below run.
  let redacted = redactWithScannerRules(text);

  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match, ...args) => {
      // If it's the key-value config match, keep the variable name but redact the value
      if (typeof args[0] === 'string' && args[0].includes('=')) {
        const prefix = args[0]; // e.g. "OPENAI_API_KEY = "
        const quoteStart = args[1] || '';
        const quoteEnd = args[3] || '';
        return `${prefix}${quoteStart}...redacted...${quoteEnd}`;
      }

      // If it's a database connection string match
      if (match.includes('://')) {
        const protocol = args[0];
        const user = args[1];
        const host = args[3];
        const dbName = args[4];
        return `${protocol}://${user}:...redacted...@${host}/${dbName}`;
      }

      // Default fallback: replace the entire matching token
      return '...redacted...';
    });
  }

  return redacted;
}
