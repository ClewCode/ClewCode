import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderClient, ProviderId, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js';

// --- OAuth constants ---
// Token refresh needs the OAuth client_id/secret. The Gemini CLI does NOT
// store these in ~/.gemini/oauth_creds.json (which holds only the tokens) —
// it ships them as public constants for its installed-app OAuth client. We
// default to those same well-known public values so that "install the Gemini
// CLI and log in" is genuinely all a user needs. They can still be overridden
// via CODE_ASSIST_CLIENT_ID / CODE_ASSIST_CLIENT_SECRET.
//   https://cloud.google.com/code-assist/docs/install
const DEFAULT_OAUTH_CLIENT_ID =
  '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
// This is the public gemini-cli installed-app credential — not confidential for
// native apps (see RFC 8252). It only identifies the app to Google; each user
// still authenticates with their own account. Override with CODE_ASSIST_CLIENT_SECRET.
const DEFAULT_OAUTH_CLIENT_SECRET = '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';
const OAUTH_CLIENT_ID = process.env.CODE_ASSIST_CLIENT_ID?.trim() || DEFAULT_OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.CODE_ASSIST_CLIENT_SECRET?.trim() || DEFAULT_OAUTH_CLIENT_SECRET;
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

  // Prefer the access token already on disk while it is still valid — avoids a
  // needless refresh round-trip (and works even if refresh creds are absent).
  if (creds.access_token && creds.expiry_date > Date.now() + 60_000) {
    cachedToken = { accessToken: creds.access_token, expiresAt: creds.expiry_date };
    return cachedToken.accessToken;
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

// --- Tool-calling type helpers ---

type OpenAIToolCall = { id?: string; function?: { name?: string; arguments?: string } };
type OpenAIMessage = {
  role: string;
  content?: string | Array<{ type: string; text?: string }> | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
};
type OpenAITool = { type?: string; function?: { name?: string; description?: string; parameters?: unknown } };
type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
type OpenAIToolCallOut = { id: string; type: 'function'; function: { name: string; arguments: string } };

/** Extract plain text from an OpenAI message's content (string or content-part array). */
function messageText(content: OpenAIMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(p => p.type === 'text')
      .map(p => p.text ?? '')
      .join('');
  }
  return '';
}

/**
 * Convert OpenAI-format chat messages to Code Assist (native Gemini) format,
 * including tool calls (assistant → functionCall) and tool results
 * (role "tool" → functionResponse). Gemini uses roles "user" and "model".
 */
function toCodeAssistMessages(messages: OpenAIMessage[]) {
  const contents: Array<{ role: string; parts: GeminiPart[] }> = [];

  // Code Assist has no 'system' role — hoist to top-level systemInstruction.
  let systemInstruction: string | undefined;

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = messageText(msg.content);
      systemInstruction = (systemInstruction ? `${systemInstruction}\n` : '') + text;
      continue;
    }

    // Tool result → Gemini functionResponse (role "user"). The tool_call_id
    // doubles as the function name (functionCall ids are set to the fn name).
    if (msg.role === 'tool') {
      const raw = messageText(msg.content);
      let response: Record<string, unknown>;
      try {
        const parsed = JSON.parse(raw);
        response = parsed && typeof parsed === 'object' ? parsed : { result: parsed };
      } catch {
        response = { result: raw };
      }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: msg.tool_call_id ?? '', response } }],
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const parts: GeminiPart[] = [];
      const text = messageText(msg.content);
      if (text) parts.push({ text });
      for (const tc of msg.tool_calls ?? []) {
        const name = tc.function?.name ?? '';
        if (!name) continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          args = {};
        }
        parts.push({ functionCall: { name, args } });
      }
      // Gemini rejects empty parts arrays.
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
      continue;
    }

    // user (and any other role) → user text
    contents.push({ role: 'user', parts: [{ text: messageText(msg.content) }] });
  }

  return { contents, systemInstruction };
}

// Gemini's functionDeclarations.parameters accepts only a restricted OpenAPI
// subset — it rejects JSON-Schema-only keywords like `$schema`,
// `additionalProperties`, `$ref`, `$defs`, etc. with a 400. Whitelist the
// fields Gemini understands and recurse into nested schemas.
const GEMINI_SCHEMA_KEYS = new Set([
  'type',
  'title',
  'description',
  'nullable',
  'enum',
  'items',
  'properties',
  'required',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'default',
  'anyOf',
  'oneOf',
  'propertyOrdering',
]);

function sanitizeGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;

  const obj = schema as Record<string, unknown>;

  // Gemini requires that when `anyOf` is present it be the ONLY field set —
  // no sibling `type`/`description`/etc. Collapse `anyOf`/`oneOf` (Gemini has
  // no `oneOf`) to a bare union of sanitized branches.
  const union = obj.anyOf ?? obj.oneOf;
  if (Array.isArray(union)) {
    return { anyOf: union.map(sanitizeGeminiSchema) };
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!GEMINI_SCHEMA_KEYS.has(key)) continue;
    if (key === 'properties' && value && typeof value === 'object') {
      const props: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value as Record<string, unknown>)) {
        props[propName] = sanitizeGeminiSchema(propSchema);
      }
      out[key] = props;
    } else if (key === 'items') {
      out[key] = sanitizeGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Gemini requires each functionDeclaration's top-level `parameters` to be an
 * OBJECT schema. Coerce anything that isn't (missing/wrong `type`, or a bare
 * union) into a well-formed object schema so the whole request isn't rejected.
 */
function toGeminiParameters(rawParameters: unknown): Record<string, unknown> {
  const sanitized = sanitizeGeminiSchema(rawParameters) as Record<string, unknown> | undefined;
  if (sanitized && sanitized.type === 'object') return sanitized;
  return {
    type: 'object',
    properties: (sanitized?.properties as Record<string, unknown>) ?? {},
    ...(Array.isArray(sanitized?.required) ? { required: sanitized.required } : {}),
  };
}

/**
 * Convert OpenAI tool definitions to Gemini functionDeclarations.
 * Returns undefined when no tools are provided.
 */
function toGeminiTools(tools: OpenAITool[] | undefined) {
  if (!tools?.length) return undefined;
  const functionDeclarations = tools
    .filter(t => t.function?.name)
    .map(t => ({
      name: t.function!.name!,
      description: t.function!.description ?? '',
      parameters: toGeminiParameters(t.function!.parameters),
    }));
  if (functionDeclarations.length === 0) return undefined;
  return [{ functionDeclarations }];
}

/** Map a Gemini finishReason to an OpenAI finish_reason. */
function toOpenAIFinishReason(reason: unknown, hasToolCall: boolean): string | null {
  if (hasToolCall) return 'tool_calls';
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case undefined:
    case null:
      return null;
    default:
      return String(reason).toLowerCase();
  }
}

/** Extract OpenAI-shaped tool_calls from a Gemini candidate's parts. */
function toolCallsFromParts(parts: any[]): OpenAIToolCallOut[] {
  const calls: OpenAIToolCallOut[] = [];
  for (const p of parts) {
    if (p?.functionCall?.name) {
      calls.push({
        id: p.functionCall.name,
        type: 'function',
        function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) },
      });
    }
  }
  return calls;
}

/** Map Gemini usageMetadata to OpenAI usage. */
function toOpenAIUsage(usageMetadata: any): Record<string, number> | null {
  if (!usageMetadata) return null;
  return {
    prompt_tokens: usageMetadata.promptTokenCount ?? 0,
    completion_tokens: usageMetadata.candidatesTokenCount ?? 0,
    total_tokens: usageMetadata.totalTokenCount ?? 0,
  };
}

/** The Code Assist endpoint wraps generateContent payloads under `response`. */
function unwrapResponse(data: any): any {
  return data?.response ?? data;
}

/**
 * Parse Code Assist API response into OpenAI-compatible format.
 */
function fromCodeAssistResponse(raw: any) {
  const data = unwrapResponse(raw);
  const choices: Array<{
    index: number;
    message: { role: string; content: string | null; tool_calls?: OpenAIToolCallOut[] };
    finish_reason: string | null;
  }> = [];

  if (data.candidates) {
    for (let i = 0; i < data.candidates.length; i++) {
      const candidate = data.candidates[i];
      const content = candidate.content ?? {};
      const parts = content.parts ?? [];
      const text = parts.map((p: any) => p.text ?? '').join('');
      const toolCalls = toolCallsFromParts(parts);
      choices.push({
        index: i,
        message: {
          role: 'assistant',
          content: text || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toOpenAIFinishReason(candidate.finishReason, toolCalls.length > 0),
      });
    }
  }

  return {
    id: data.responseId ?? `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: data.modelVersion ?? data.model ?? '',
    choices,
    usage: toOpenAIUsage(data.usageMetadata),
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

            // 3. Convert messages + tools
            const { contents, systemInstruction } = toCodeAssistMessages(params.messages as OpenAIMessage[]);
            const geminiTools = toGeminiTools(params.tools as OpenAITool[] | undefined);

            // 4. Build request body
            const requestBody: Record<string, unknown> = {
              contents,
              ...(geminiTools ? { tools: geminiTools } : {}),
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
      { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (Preview)' },
      { id: 'gemini-3.0-flash', label: 'Gemini 3.0 Flash (Preview)' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
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
  // Monotonic index shared across chunks so multi-call responses map to
  // distinct tool_use blocks downstream (AnthropicAdapter keys on tc.index).
  let toolCallIndex = 0;

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
        // Code Assist wraps each SSE payload under `response`.
        const data = unwrapResponse(JSON.parse(jsonStr));

        // Gemini delivers each functionCall whole (name + full args) in one
        // chunk, so we emit a single tool_call delta per call with an
        // incrementing index carried across chunks via toolCallIndex.
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const text = parts.map((p: any) => p.text ?? '').join('');
        const rawToolCalls = toolCallsFromParts(parts);
        const hasToolCall = rawToolCalls.length > 0;

        const delta: Record<string, unknown> = {};
        if (text) delta.content = text;
        if (hasToolCall) {
          delta.tool_calls = rawToolCalls.map(tc => ({ index: toolCallIndex++, ...tc }));
        }
        if (text || hasToolCall) delta.role = 'assistant';

        const chunk = {
          id: data.responseId ?? `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: data.modelVersion ?? data.model ?? '',
          choices: [
            {
              index: 0,
              delta,
              finish_reason: toOpenAIFinishReason(data.candidates?.[0]?.finishReason, hasToolCall),
            },
          ],
          ...(data.usageMetadata ? { usage: toOpenAIUsage(data.usageMetadata) } : {}),
        };

        yield chunk;
      } catch {
        // Skip invalid JSON
      }
    }
  }
}
