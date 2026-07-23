// Google OAuth configuration constants for Gemini browser authentication

const DEFAULT_GOOGLE_CLIENT_ID = '';
const DEFAULT_CALLBACK_PORT = 1456;

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readCallbackPort(): number {
  const raw = process.env.GOOGLE_OAUTH_CALLBACK_PORT?.trim();

  if (!raw) {
    return DEFAULT_CALLBACK_PORT;
  }

  const port = Number.parseInt(raw, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid GOOGLE_OAUTH_CALLBACK_PORT: ${raw}. Expected a port between 1 and 65535.`);
  }

  return port;
}

const callbackPort = readCallbackPort();

export const GOOGLE_OAUTH_CONFIG = {
  AUTHORIZE_URL: 'https://accounts.google.com/o/oauth2/auth',
  TOKEN_URL: 'https://oauth2.googleapis.com/token',

  // Google OAuth client id used for sign-in.
  CLIENT_ID: envOrDefault('GOOGLE_OAUTH_CLIENT_ID', DEFAULT_GOOGLE_CLIENT_ID),

  // Optional Client Secret (only required by Google for certain client types)
  CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || '',

  // Local browser callback URI. Google now rejects the `localhost` hostname and
  // requires the loopback IP `127.0.0.1`; the path must match what the gemini-cli
  // public OAuth client registers (`/oauth2callback`). Using `localhost` or a
  // different path makes Google return a 400 "malformed request" at the consent
  // screen. Mirrors gemini-cli's `http://127.0.0.1:{port}/oauth2callback`.
  REDIRECT_URI: `http://127.0.0.1:${callbackPort}/oauth2callback`,

  // Standard manual/headless callback URI
  MANUAL_REDIRECT_URI: envOrDefault('GOOGLE_OAUTH_MANUAL_REDIRECT_URI', 'urn:ietf:wg:oauth:2.0:oob'),

  // Scopes required for Google Gemini API and basic info
  SCOPES: [
    'openid',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/generative-language',
  ],
} as const;

export const CODE_CHALLENGE_METHOD = 'S256' as const;
export const GOOGLE_TOKEN_STORAGE_KEY = 'google_oauth_tokens';
