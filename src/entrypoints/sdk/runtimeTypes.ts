/**
 * SDK Runtime Types - Non-serializable types (callbacks, interfaces with methods).
 *
 * These types are used by SDK consumers for session management, query execution,
 * tool definitions, and plugin configuration.
 */

// ============================================================================
// Query Types
// ============================================================================

export type AnyZodRawShape = Record<string, import('zod/v4').ZodTypeAny>;
export type InferShape<T extends AnyZodRawShape> = { [K in keyof T]: import('zod/v4').z.infer<T[K]> };

export interface Options {
  model?: string;
  provider?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  dir?: string;
  env?: Record<string, string | undefined>;
  sandbox?: SandboxOptions;
}

export interface InternalOptions extends Options {
  onStreamEvent?: (event: unknown) => void;
}

export interface Query {
  prompt: string | AsyncIterable<unknown>;
  options?: Options;
  then: <TResult>(onfulfilled?: (value: string) => TResult | PromiseLike<TResult>) => Promise<TResult>;
  catch: <TResult>(onrejected?: (reason: unknown) => TResult | PromiseLike<TResult>) => Promise<TResult>;
  finally: (onfinally?: () => void) => Promise<string>;
  [Symbol.toStringTag]: string;
}

export interface InternalQuery {
  prompt: string | AsyncIterable<unknown>;
  options?: InternalOptions;
  then: <TResult>(onfulfilled?: (value: string) => TResult | PromiseLike<TResult>) => Promise<TResult>;
  catch: <TResult>(onrejected?: (reason: unknown) => TResult | PromiseLike<TResult>) => Promise<TResult>;
  finally: (onfinally?: () => void) => Promise<string>;
  [Symbol.toStringTag]: string;
}

// ============================================================================
// Session Types
// ============================================================================

export interface SDKSessionOptions {
  model?: string;
  provider?: string;
  maxTokens?: number;
  dir?: string;
  env?: Record<string, string | undefined>;
  sandbox?: SandboxOptions;
  autoLaunch?: boolean;
  resumePrevious?: string;
}

export interface SDKSession {
  sessionId: string;
  query(params: { prompt: string | AsyncIterable<unknown>; options?: Options }): Query;
  close(): Promise<void>;
}

export interface ForkSessionOptions {
  dir?: string;
  upToMessageId?: string;
  title?: string;
}

export interface ForkSessionResult {
  sessionId: string;
}

export interface GetSessionInfoOptions {
  dir?: string;
}

export interface ListSessionsOptions {
  dir?: string;
  limit?: number;
  offset?: number;
}

export interface SessionMutationOptions {
  dir?: string;
}

export interface GetSessionMessagesOptions {
  dir?: string;
  limit?: number;
  offset?: number;
  includeSystemMessages?: boolean;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | unknown[];
  uuid: string;
  parent_uuid?: string;
  timestamp?: number;
}

export interface SDKSessionInfo {
  sessionId: string;
  summary?: string;
  title?: string;
  tag?: string;
  createdAt?: number;
  lastModifiedAt?: number;
  model?: string;
  messageCount?: number;
  dir?: string;
}

// ============================================================================
// Tool & MCP Types
// ============================================================================

export interface SdkMcpToolDefinition<Schema extends AnyZodRawShape = AnyZodRawShape> {
  name: string;
  description: string;
  inputSchema: Schema;
  handler: (
    args: InferShape<Schema>,
    extra: unknown,
  ) => Promise<import('@modelcontextprotocol/sdk/types.js').CallToolResult>;
  annotations?: import('@modelcontextprotocol/sdk/types.js').ToolAnnotations;
  searchHint?: string;
  alwaysLoad?: boolean;
}

export interface McpSdkServerConfigWithInstance {
  name: string;
  version?: string;
  tools: Array<SdkMcpToolDefinition>;
  transport: unknown;
  serverInstance: unknown;
}

// ============================================================================
// Sandbox Types
// ============================================================================

export interface SandboxOptions {
  mode?: 'main' | 'non-main' | 'none';
  image?: string;
  toolbox?: unknown;
}

// ============================================================================
// Plugin & Hook Types
// ============================================================================

export interface RegisteredHookMatcher {
  matcher?: string;
  hookCallbackIds: string[];
  timeout?: number;
}
