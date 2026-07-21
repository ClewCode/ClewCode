import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js';
import type { ProviderClient, ProviderId, ProviderInitOptions, ProviderInterface } from './ProviderInterface.js';

// --- OAuth constants ---
// Public installed-app credentials identify Antigravity's native OAuth client;
// user authorization is still required (RFC 8252). Environment overrides make
// it possible to rotate the public client without shipping a new Clew build.
// Note: Credentials must be configured via environment variables ANTIGRAVITY_CLIENT_ID and ANTIGRAVITY_CLIENT_SECRET
const OAUTH_CLIENT_ID = process.env.ANTIGRAVITY_CLIENT_ID?.trim();
const OAUTH_CLIENT_SECRET = process.env.ANTIGRAVITY_CLIENT_SECRET?.trim();
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CODE_ASSIST_ENDPOINT = process.env.ANTIGRAVITY_ENDPOINT?.trim() || 'https://daily-cloudcode-pa.googleapis.com';
const CODE_ASSIST_API_VERSION = 'v1internal';
const ANTIGRAVITY_OAUTH_PATH = join(homedir(), '.antigravity', 'oauth_creds.json');
const AGY_PATH =
  process.env.AGY_PATH?.trim() ||
  (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'agy', 'bin', 'agy.exe')
    : join(homedir(), '.local', 'bin', 'agy'));
const ANTIGRAVITY_HEADERS = {
  'User-Agent': 'antigravity/1.18.3 windows/amd64',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata': `{"ideType":"ANTIGRAVITY","platform":"${process.platform === 'win32' ? 'WINDOWS' : 'MACOS'}","pluginType":"GEMINI"}`,
} as const;

// Exported so `/login antigravity` can reuse Antigravity's OAuth client and
// scopes. Device Authorization Flow
// is NOT an option here: Google's device flow does not allow the cloud-platform
// scope, so a loopback/manual-code browser flow is the only path.
export const ANTIGRAVITY_OAUTH_CLIENT = {
  clientId: OAUTH_CLIENT_ID,
  clientSecret: OAUTH_CLIENT_SECRET,
} as const;
export const ANTIGRAVITY_REDIRECT_URI = 'http://localhost:51121/oauth-callback';
export const ANTIGRAVITY_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
] as const;

/** True when usable Antigravity OAuth creds already exist on disk (any token that
 *  can be used or refreshed). Lets the UI skip the login prompt. */
export function hasAntigravityOAuthCreds(): boolean {
  return existsSync(AGY_PATH);
}

/**
 * Persists Antigravity OAuth tokens separately from Gemini API credentials and
 * resets the in-memory caches so the next request uses the fresh login.
 */
export function saveAntigravityOAuthCreds(tokens: {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string[];
}): void {
  mkdirSync(dirname(ANTIGRAVITY_OAUTH_PATH), { recursive: true });
  writeFileSync(
    ANTIGRAVITY_OAUTH_PATH,
    JSON.stringify(
      {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken ?? '',
        scope: tokens.scope?.join(' ') ?? ANTIGRAVITY_SCOPES.join(' '),
        token_type: 'Bearer',
        expiry_date: tokens.expiresAt ?? Date.now() + 3600_000,
      },
      null,
      2,
    ),
    'utf8',
  );
  cachedToken = tokens.expiresAt ? { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt } : null;
  cachedProjectId = null;
}

// --- In-memory caches ---
let cachedToken: { accessToken: string; expiresAt: number } | null = null;
let cachedProjectId: string | null = null;
let tokenRefreshPromise: Promise<string> | null = null;

const WINDOWS_CREDENTIAL_SCRIPT = `
$src='using System;using System.Runtime.InteropServices;public static class ClewCredRead{[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]public struct C{public uint Flags,Type;public string TargetName,Comment;public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;public uint BlobSize;public IntPtr Blob;public uint Persist,AttrCount;public IntPtr Attrs;public string Alias,User;}[DllImport("advapi32",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)]public static extern bool Read(string t,uint y,uint f,out IntPtr p);[DllImport("advapi32")]public static extern void CredFree(IntPtr p);}';
Add-Type $src;$p=[IntPtr]::Zero;if(-not[ClewCredRead]::Read('gemini:antigravity',1,0,[ref]$p)){exit 1};try{$c=[Runtime.InteropServices.Marshal]::PtrToStructure($p,[type][ClewCredRead+C]);$b=New-Object byte[] $c.BlobSize;[Runtime.InteropServices.Marshal]::Copy($c.Blob,$b,0,$b.Length);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($b))}finally{[ClewCredRead]::CredFree($p)}
`;

async function readAgyKeyringCreds(): Promise<
  { access_token: string; refresh_token: string; expiry_date: number } | undefined
> {
  if (process.platform !== 'win32') return undefined;
  const result = await execFileNoThrow(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_CREDENTIAL_SCRIPT],
    { timeout: 10_000, preserveOutputOnError: false, useCwd: false },
  );
  if (result.code !== 0 || !result.stdout) return undefined;
  try {
    const data = JSON.parse(result.stdout) as {
      token?: { access_token?: string; refresh_token?: string; expiry?: string };
    };
    const token = data.token;
    if (!token?.access_token || !token.refresh_token) return undefined;
    const expiry = token.expiry ? Date.parse(token.expiry) : 0;
    return { access_token: token.access_token, refresh_token: token.refresh_token, expiry_date: expiry };
  } catch {
    return undefined;
  }
}

// --- Helpers ---

function readOAuthCreds(): { access_token: string; refresh_token: string; expiry_date: number } | undefined {
  try {
    const raw = readFileSync(ANTIGRAVITY_OAUTH_PATH, 'utf8');
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

export function parseResetTimeMs(body: string): number | undefined {
  // 'ms' must precede 'm' in the alternation or "500ms" parses as 500 minutes.
  const match = body.match(/reset after\s+(\d+)(ms|s|m|h)?/i);
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
  const err = new Error(`Antigravity API error (${status}): ${body}`);
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
      'Antigravity OAuth client is not configured. Set ANTIGRAVITY_CLIENT_ID and ANTIGRAVITY_CLIENT_SECRET.',
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
    // invalid_client almost always means the stored refresh_token was minted for
    // a *different* OAuth client (e.g. the VS Code Google extension) than the one
    // Clew uses. A fresh login via `/login antigravity` re-mints a compatible
    // token and is the only fix.
    if (text.includes('invalid_client')) {
      throw new Error(
        'Google OAuth refresh failed: the stored refresh token belongs to a different ' +
          'OAuth client and cannot be refreshed by Clew. Fix: run `/login antigravity` ' +
          'and sign in again. This overwrites ~/.antigravity/oauth_creds.json ' +
          'with a token Clew can refresh. (original: ' +
          text +
          ')',
      );
    }
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

  // If refresh is already in progress, wait for it instead of starting another
  if (tokenRefreshPromise) {
    return tokenRefreshPromise;
  }

  const creds = (await readAgyKeyringCreds()) ?? readOAuthCreds();
  if (!creds) {
    throw new Error('No Antigravity OAuth credentials found. Run `/login antigravity` to sign in with Google.');
  }

  // Prefer the access token already on disk while it is still valid — avoids a
  // needless refresh round-trip (and works even if refresh creds are absent).
  if (creds.access_token && creds.expiry_date > Date.now() + 60_000) {
    cachedToken = { accessToken: creds.access_token, expiresAt: creds.expiry_date };
    return cachedToken.accessToken;
  }

  // Guard against concurrent refresh attempts (BUG #1)
  if (!creds.refresh_token) {
    throw new Error(
      'Antigravity OAuth token expired and cannot be refreshed. Run `/login antigravity` to sign in again.',
    );
  }

  tokenRefreshPromise = refreshAccessToken(creds.refresh_token)
    .then(({ accessToken, expiresIn }) => {
      cachedToken = {
        accessToken,
        expiresAt: Date.now() + expiresIn * 1000,
      };
      // Clear projectId cache when token refreshes to ensure it's rediscovered (BUG #5)
      cachedProjectId = null;
      return accessToken;
    })
    .finally(() => {
      tokenRefreshPromise = null;
    });

  return tokenRefreshPromise;
}

async function discoverProjectId(accessToken: string): Promise<string> {
  if (cachedProjectId) return cachedProjectId;

  const response = await fetch(`${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:loadCodeAssist`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...ANTIGRAVITY_HEADERS,
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
  | {
      functionCall: { name: string; args: Record<string, unknown> };
      thoughtSignature: string;
      thought_signature: string;
    }
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
export function toCodeAssistMessages(messages: OpenAIMessage[]) {
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
    // is "<fnName>:<counter>" (see toolCallsFromParts) — strip the counter to
    // recover the function name.
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
        parts: [{ functionResponse: { name: (msg.tool_call_id ?? '').split(':')[0], response } }],
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
        // Google documents this sentinel for replayed tool calls where the
        // original provider signature is unavailable (for example after an
        // OpenAI-compatible adapter round trip).
        const signature = 'skip_thought_signature_validator';
        parts.push({ functionCall: { name, args }, thoughtSignature: signature, thought_signature: signature });
      }
      // Gemini rejects empty parts arrays.
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
      continue;
    }

    // user (and any other role) → user text. Image parts are not forwarded
    // (this provider sends text-only requests) — say so instead of dropping
    // them silently.
    const hasImage =
      Array.isArray(msg.content) && msg.content.some(p => (p as { type?: string })?.type === 'image_url');
    const userText =
      messageText(msg.content) +
      (hasImage ? '\n[Image not sent - the Gemini Code Assist provider does not support image input]' : '');
    contents.push({ role: 'user', parts: [{ text: userText }] });
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
export function toOpenAIFinishReason(reason: unknown, hasToolCall: boolean): string | null {
  // Function calls can arrive across several SSE events. Do not terminate the
  // downstream stream until Gemini explicitly marks the candidate complete.
  if (reason === undefined || reason === null) return null;
  if (hasToolCall) return 'tool_calls';
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    default:
      return String(reason).toLowerCase();
  }
}

/** Extract OpenAI-shaped tool_calls from a Gemini candidate's parts. */
export function toolCallsFromParts(parts: any[], startIndex = 0, idPrefix = randomUUID()): OpenAIToolCallOut[] {
  const calls: OpenAIToolCallOut[] = [];
  for (const p of parts) {
    if (p?.functionCall?.name) {
      // Suffix with a counter (':' is invalid in Gemini function names, so the
      // original name is recoverable) — two calls to the same function in one
      // turn must not share a tool_call_id.
      calls.push({
        id: `${p.functionCall.name}:${idPrefix}:${startIndex + calls.length}`,
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
      const toolCalls = toolCallsFromParts(parts, 0, data.responseId ?? randomUUID());
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

const AGY_MODEL_NAMES: Record<string, string> = {
  'gemini-3.5-flash-medium': 'Gemini 3.5 Flash (Medium)',
  'gemini-3.5-flash-high': 'Gemini 3.5 Flash (High)',
  'gemini-3.5-flash-low': 'Gemini 3.5 Flash (Low)',
  'gemini-3.1-pro-low': 'Gemini 3.1 Pro (Low)',
  'gemini-3.1-pro-high': 'Gemini 3.1 Pro (High)',
  'claude-sonnet-4-6-thinking': 'Claude Sonnet 4.6 (Thinking)',
  'claude-opus-4-6-thinking': 'Claude Opus 4.6 (Thinking)',
  'gpt-oss-120b-medium': 'GPT-OSS 120B (Medium)',
};

function toAgyModelName(model: string): string {
  return AGY_MODEL_NAMES[model] ?? model;
}

function toDirectModelName(model: string): string {
  const names: Record<string, string> = {
    'gemini-3.5-flash-low': 'gemini-3.5-flash-extra-low',
    'gemini-3.5-flash-medium': 'gemini-3.5-flash-low',
    'gemini-3.5-flash-high': 'gemini-3-flash-agent',
    'gemini-3.1-pro-high': 'gemini-pro-agent',
  };
  return names[model] ?? model;
}

export function buildAgyPrompt(messages: OpenAIMessage[]): string {
  return messages.map(message => `${message.role.toUpperCase()}: ${messageText(message.content)}`).join('\n\n');
}

async function* singleChunkStream(text: string, model: string): AsyncGenerator<Record<string, unknown>> {
  const common = {
    id: `agy-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
  };
  yield { ...common, choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] };
  yield { ...common, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
}

function createAgyClient(): ProviderClient {
  return {
    chat: {
      completions: {
        create: async (params: { model: string; messages: OpenAIMessage[]; stream?: boolean }) => {
          if (!existsSync(AGY_PATH)) throw new Error('Antigravity CLI was not found. Install `agy` or set AGY_PATH.');
          const prompt = buildAgyPrompt(params.messages);
          const result = await execFileNoThrow(
            AGY_PATH,
            ['--print', prompt, '--model', toAgyModelName(params.model), '--print-timeout', '10m'],
            { timeout: 11 * 60_000, preserveOutputOnError: true, useCwd: true },
          );
          if (result.code !== 0) {
            throw new Error(result.stderr.trim() || result.error || `agy exited with code ${result.code}`);
          }
          const text = result.stdout.trim();
          if (params.stream) return singleChunkStream(text, params.model);
          return {
            id: `agy-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: params.model,
            choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          };
        },
      },
    },
  } as ProviderClient;
}

// --- Provider ---

export class AntigravityProvider implements ProviderInterface {
  readonly providerId: ProviderId = 'antigravity';
  readonly label = 'Google Antigravity CLI';

  getProviderId() {
    return this.providerId;
  }

  getProviderLabel() {
    return this.label;
  }

  getProviderApiKeyEnvVar() {
    return '';
  }

  async createClient(_options: ProviderInitOptions): Promise<ProviderClient> {
    if (process.env.ANTIGRAVITY_USE_AGY === '1') return createAgyClient();
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
              model: toDirectModelName(params.model),
              project: projectId,
              request: requestBody,
            };

            // 5. Make API request
            const method = isStreaming ? 'streamGenerateContent?alt=sse' : 'generateContent';
            const url = `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:${method}`;
            const headers: Record<string, string> = {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              ...ANTIGRAVITY_HEADERS,
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
    // Antigravity has no public model-list endpoint; keep this allowlist aligned
    // with the models exposed by the CLI service.
    return [
      { id: 'gemini-3.5-flash-medium', label: 'Gemini 3.5 Flash (Medium)' },
      { id: 'gemini-3.5-flash-high', label: 'Gemini 3.5 Flash (High)' },
      { id: 'gemini-3.5-flash-low', label: 'Gemini 3.5 Flash (Low)' },
      { id: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)' },
      { id: 'gemini-3.1-pro-low', label: 'Gemini 3.1 Pro (Low)' },
      { id: 'claude-sonnet-4-6-thinking', label: 'Claude Sonnet 4.6 (Thinking)' },
      { id: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 Thinking' },
      { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
    ];
  }
}

/**
 * Handle SSE streaming from Code Assist API.
 * Returns an async generator that yields OpenAI-compatible chunks.
 */
export async function* handleSSEStream(response: Response): AsyncGenerator<unknown, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body for streaming');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  // Monotonic index shared across chunks so multi-call responses map to
  // distinct tool_use blocks downstream (AnthropicAdapter keys on tc.index).
  let toolCallIndex = 0;
  let sawToolCall = false;
  const toolCallIdPrefix = randomUUID();

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
        const rawToolCalls = toolCallsFromParts(parts, toolCallIndex, toolCallIdPrefix);
        const hasToolCall = rawToolCalls.length > 0;
        if (hasToolCall) sawToolCall = true;

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
              finish_reason: toOpenAIFinishReason(data.candidates?.[0]?.finishReason, sawToolCall),
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
