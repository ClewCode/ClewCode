import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ANTIGRAVITY_OAUTH_PATH = join(homedir(), '.antigravity', 'oauth_creds.json');
const GEMINI_OAUTH_PATH = join(homedir(), '.gemini', 'oauth_creds.json');
const CODEX_AUTH_PATH = join(homedir(), '.codex', 'auth.json');

/**
 * Read API key/token from local provider config files.
 *
 * Falls back to tokens stored by:
 * - Google Antigravity / Gemini: ~/.antigravity/oauth_creds.json or ~/.gemini/oauth_creds.json (OAuth access_token)
 * - Codex CLI:    ~/.codex/auth.json (OpenAI OAuth access_token)
 *
 * Returns undefined if the file doesn't exist or can't be parsed.
 */
export function readLocalProviderKey(provider: string): string | undefined {
  try {
    switch (provider) {
      case 'google':
      case 'gemini':
      case 'antigravity':
      case 'google-assist': {
        for (const path of [ANTIGRAVITY_OAUTH_PATH, GEMINI_OAUTH_PATH]) {
          try {
            const data: Record<string, unknown> = JSON.parse(readFileSync(path, 'utf8'));
            const token = data.access_token;
            if (typeof token === 'string' && token.length > 0) return token;
          } catch {
            // try next path
          }
        }
        return undefined;
      }
      case 'openai':
      case 'codex': {
        const data: Record<string, unknown> = JSON.parse(readFileSync(CODEX_AUTH_PATH, 'utf8'));
        const tokens = data.tokens as Record<string, unknown> | undefined;
        const token = tokens?.access_token;
        return typeof token === 'string' && token.length > 0 ? token : undefined;
      }
    }
  } catch {
    // File doesn't exist, invalid JSON, etc. — silently return undefined.
  }
  return undefined;
}
