import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderClient, ProviderId, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js';

// --- OAuth constants ---
// These credentials must come from the Gemini CLI's OAuth creds file
// (~/.gemini/oauth_creds.json) or be set via environment variables.
// Obtain them by installing the Gemini CLI and logging in:
//   https://cloud.google.com/code-assist/docs/install
const OAUTH_CLIENT_ID = process.env.CODE_ASSIST_CLIENT_ID?.trim();
const OAUTH_CLIENT_SECRET = process.env.CODE_ASSIST_CLIENT_SECRET?.trim();
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CODE_ASSIST_ENDPOINT = process.env.CODE_ASSIST_ENDPOINT?.trim() || 'https://daily-cloudcode-pa.googleapis.com';
const CODE_ASSIST_API_VERSION = 'v1internal';
const GEMINI_OAUTH_PATH = join(homedir(), '.gemini', 'oauth_creds.json');

// --- In-memory caches ---
let cachedToken: { accessToken: string; expiresAt: number } | null = null;
let cachedProjectId: string | null = null;

// --- Helpers ---

function readOAuthCreds(): { access_token: string; refresh_token: string; expiry_date: number } | undefined {
  try {
    const raw = readFileSync(GEMINI_OAUTH_PATH, 'utf8');
    const d = JSON.parse(raw) as {
      access_token?: string;
      refresh_token?: string;
      expiry_date?: number;
    };
    if (d.access_token && d.refresh_token && d.expiry_date) {
      return d as { access_token: string; refresh_token: string; expiry_date: number };
    }
    // If we only have refresh_token, that is enough — we can refresh
    if (d.refresh_token) {
      return {
        access_token: d.access_token ?? '',
        refresh_token: d.refresh_token,
        expiry_date: d.expiry_date ?? 0,
      };
    }
  } catch {
    // File not found or invalid JSON
  }
  return undefined;
}

function parseResetTimeMs(body: string): number | undefined {
  const match = body.match(/reset after\s+(\d+)(s|m|h|ms)?/i);
  if (!match) return undefined;
  const val = parseInt(match[1], 10);
  if (Number.isNaN(val)) return undefined;
  const unit = match[2]?.toLowerCase() || 's';
  if (unit === 'm') return val * 60 * 1000;
  if (unit === 'h') return val * 60 * 60 * 1000;
  if (unit === 'ms') return val;
  return val * 1000;
}

function createCodeAssistError(status: number, body: string): Error {
  const err = new Error(`Code Assist API error (${status}): ${body}`);
  (err as any).status = status;
  (err as any).body = body;

  let retryAfter: number | undefined;
  if (status === 429) {
    const parsedMs = parseResetTimeMs(body);
    if (parsedMs !== undefined) {
      // Clamp to at least 1000ms for 429s to prevent instant retry loops
      retryAfter = Math.max(parsedMs, 1000);
    }
  }

  (err as any)._providerError = {
    category: status === 429 ? 'rate_limit' : status >= 500 ? 'server_error' : 'client_error',
    status,
    ...(retryAfter !== undefined ? { retryAfter } : {}),
  };
  return err;
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    throw new Error(
      'Code Assist OAuth credentials not configured. Set CODE_ASSIST_CLIENT_ID and CODE_ASSIST_CLIENT_SECRET ' +
        'environment variables, or install the Gemini CLI and run `gcloud auth application-default login`.',
    );
  }
  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token refresh failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('OAuth refresh returned no access_token');
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

async function getValidToken(): Promise<string> {
  // Check in-memory cache first
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const creds = readOAuthCreds();
  if (!creds) {
    throw new Error('No Gemini OAuth credentials found. Login with Gemini CLI first (~/.gemini/oauth_creds.json)');
  }

  const { accessToken, expiresIn } = await refreshAccessToken(creds.refresh_token);
  cachedToken = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return cachedToken.accessToken;
}

async function discoverProjectId(accessToken: string): Promise<string> {
  if (cachedProjectId) return cachedProjectId;

  const response = await fetch(`${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:loadCodeAssist`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`loadCodeAssist failed (${response.status}): ${text}`);
    (err as any).status = response.status;
    throw err;
  }

  const data = (await response.json()) as { cloudaicompanionProject?: string };
  if (!data.cloudaicompanionProject) {
    throw new Error('loadCodeAssist returned no project ID');
  }

  cachedProjectId = data.cloudaicompanionProject;
  return cachedProjectId!;
}

/**
 * Convert OpenAI-format chat messages to Code Assist API format.
 */
function toCodeAssistMessages(messages: Array<{ role: string; content: string }>) {
  // Map standard roles to Code Assist roles
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // Code Assist doesn't support 'system' role — prepend as a user message instruction
  // or inject as systemInstruction at the top level
  let systemInstruction: string | undefined;

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = (systemInstruction ? `${systemInstruction}\n` : '') + msg.content;
    } else if (msg.role === 'assistant' || msg.role === 'user') {
      contents.push({
        role: msg.role,
        parts: [{ text: msg.content }],
      });
    }
  }

  return { contents, systemInstruction };
}

/**
 * Parse Code Assist API response into OpenAI-compatible format.
 */
function fromCodeAssistResponse(data: any) {
  const choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string | null;
  }> = [];

  if (data.candidates) {
    for (let i = 0; i < data.candidates.length; i++) {
      const candidate = data.candidates[i];
      const content = candidate.content ?? {};
      const parts = content.parts ?? [];
      const text = parts.map((p: any) => p.text ?? '').join('');
      choices.push({
        index: i,
        message: {
          role: content.role ?? 'assistant',
          content: text,
        },
        finish_reason: candidate.finishReason ?? null,
      });
    }
  }

  return {
    id: data.id ?? `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: data.model ?? '',
    choices,
    usage: data.usage ?? null,
  };
}

// --- Provider ---

export class CodeAssistProvider implements ProviderInterface {
  readonly providerId: ProviderId = 'google-assist';
  readonly label = 'Gemini Code Assist (OAuth)';

  getProviderId() {
    return this.providerId;
  }

  getProviderLabel() {
    return this.label;
  }

  getProviderApiKeyEnvVar() {
    return 'GEMINI_API_KEY'; // Fallback env var, but OAuth is primary
  }

  async createClient(_options: ProviderInitOptions): Promise<ProviderClient> {
    return {
      chat: {
        completions: {
          create: async (params: {
            model: string;
            messages: Array<{ role: string; content: string }>;
            max_tokens?: number;
            temperature?: number;
            stream?: boolean;
            [key: string]: unknown;
          }) => {
            const isStreaming = params.stream === true;

            // 1. Get valid OAuth token
            const token = await getValidToken();

            // 2. Discover project ID
            const projectId = await discoverProjectId(token);

            // 3. Convert messages
            const { contents, systemInstruction } = toCodeAssistMessages(params.messages);

            // 4. Build request body
            const requestBody: Record<string, unknown> = {
              contents,
              ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
              ...(params.max_tokens ? { generationConfig: { maxOutputTokens: params.max_tokens } } : {}),
              ...(params.temperature !== undefined
                ? {
                    generationConfig: {
                      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
                    },
                  }
                : {}),
            };

            // Merge generationConfig if both max_tokens and temperature are set
            if (params.max_tokens && params.temperature !== undefined) {
              requestBody.generationConfig = {
                maxOutputTokens: params.max_tokens,
                temperature: params.temperature,
              };
            }

            const codeAssistBody = {
              model: params.model,
              project: projectId,
              request: requestBody,
            };

            // 5. Make API request
            const method = isStreaming ? 'streamGenerateContent?alt=sse' : 'generateContent';
            const url = `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`;
            const headers: Record<string, string> = {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            };

            if (isStreaming) {
              headers.Accept = 'text/event-stream';
            }

            const response = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(codeAssistBody),
            });

            if (!response.ok) {
              const text = await response.text();
              // If 401, invalidate token cache and try once more
              if (response.status === 401) {
                cachedToken = null;
                const newToken = await getValidToken();
                const retryResponse = await fetch(url, {
                  method: 'POST',
                  headers: { ...headers, Authorization: `Bearer ${newToken}` },
                  body: JSON.stringify(codeAssistBody),
                });
                if (!retryResponse.ok) {
                  const retryText = await retryResponse.text();
                  throw createCodeAssistError(retryResponse.status, retryText);
                }
                if (isStreaming) {
                  return handleSSEStream(retryResponse);
                }
                const retryData = await retryResponse.json();
                return fromCodeAssistResponse(retryData);
              }
              throw createCodeAssistError(response.status, text);
            }

            if (isStreaming) {
              return handleSSEStream(response);
            }

            const data = await response.json();
            return fromCodeAssistResponse(data);
          },
        },
      },
    };
  }

  async listModels(_options: ProviderInitOptions): Promise<Array<{ id: string; label: string }>> {
    // The Code Assist OAuth endpoint is not the public Gemini API; keep this list to IDs
    // known to work through daily-cloudcode-pa.googleapis.com.
    return [
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ];
  }
}

/**
 * Handle SSE streaming from Code Assist API.
 * Returns an async generator that yields OpenAI-compatible chunks.
 */
async function* handleSSEStream(response: Response): AsyncGenerator<unknown, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body for streaming');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed?.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === '[DONE]') return;

      try {
        const data = JSON.parse(jsonStr);

        // Convert Code Assist SSE chunk to OpenAI-compatible chunk
        const text = extractTextFromChunk(data);
        const chunk = {
          id: data.id ?? `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: data.model ?? '',
          choices: [
            {
              index: 0,
              delta: text ? { role: 'assistant', content: text } : {},
              finish_reason: data.candidates?.[0]?.finishReason ?? null,
            },
          ],
        };

        yield chunk;
      } catch {
        // Skip invalid JSON
      }
    }
  }
}

function extractTextFromChunk(data: any): string {
  try {
    const candidate = data.candidates?.[0];
    if (!candidate) return '';
    const parts = candidate.content?.parts ?? [];
    return parts.map((p: any) => p.text ?? '').join('');
  } catch {
    return '';
  }
}
