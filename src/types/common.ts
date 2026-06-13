/**
 * Common Types for Multi-Provider Support
 * These types replace Anthropic-specific types to support multiple providers
 */

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  image_url?: { url: string };
  tool_use_id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | Array<ContentBlock>;
  is_error?: boolean;
}

export interface ContentBlockParam {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  image_url?: { url: string };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | Array<ContentBlockParam>;
  is_error?: boolean;
}

export interface ToolResultBlockParam {
  type: 'tool_result';
  tool_use_id: string;
  content?: string | Array<ContentBlockParam>;
  is_error?: boolean;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  iterations?: number;
}

/**
 * @[MULTI_PROVIDER] Provider-agnostic content block type.
 * Used as an intermediate representation between provider-specific formats.
 * Adapters convert their native types <-> ProviderContentBlock.
 */
export type ProviderContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'image'; source: unknown; media_type?: string }
  | { type: 'video'; source: unknown; media_type?: string }
  | { type: 'refusal'; refusal: string };

export interface MessageParam {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<ContentBlockParam>;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolChoice {
  type: 'auto' | 'any' | 'tool';
  name?: string;
}

export interface APIError extends Error {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface MessageStreamParams {
  max_tokens?: number;
  system?: string;
  tools?: Array<Tool>;
  tool_choice?: ToolChoice;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}
