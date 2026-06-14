/**
 * @[MULTI_PROVIDER] Content Block Conversion Utilities
 *
 * Converts between provider-specific content block formats and the
 * provider-agnostic `ProviderContentBlock` type.
 *
 * Each provider adapter should export a `toProviderContentBlock(block)` and
 * `fromProviderContentBlock(block)` for their native types.
 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type { ProviderContentBlock } from '../../types/common.js';

// ── Anthropic <-> ProviderContentBlock ────────────────────────────────────

/**
 * Convert an Anthropic ContentBlockParam to a ProviderContentBlock.
 * Handles text, tool_use, tool_result, thinking, image, and refusal blocks.
 */
export function fromAnthropicContentBlock(block: ContentBlockParam): ProviderContentBlock {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text ?? '' };
    case 'tool_use':
      return {
        type: 'tool_use',
        id: block.id ?? '',
        name: block.name ?? '',
        input: (block.input as Record<string, unknown>) ?? {},
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.tool_use_id ?? '',
        content: block.content,
        is_error: block.is_error,
      };
    case 'thinking':
      return {
        type: 'thinking',
        thinking: (block as any).thinking ?? '',
        signature: (block as any).signature,
      };
    case 'image':
      return {
        type: 'image',
        source: (block as any).source,
        media_type: (block as any).media_type,
      };
    case 'video':
      return {
        type: 'video',
        source: (block as any).source,
        media_type: (block as any).media_type,
      } as ProviderContentBlock;
    case 'refusal':
      return { type: 'refusal', refusal: (block as any).refusal ?? '' };
    default:
      return { type: 'text', text: JSON.stringify(block) };
  }
}

/**
 * Convert a ProviderContentBlock back to an Anthropic ContentBlockParam.
 * The reverse of fromAnthropicContentBlock.
 */
export function toAnthropicContentBlock(block: ProviderContentBlock): ContentBlockParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text } as ContentBlockParam;
    case 'tool_use':
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input,
      } as ContentBlockParam;
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.tool_use_id,
        content: block.content,
        is_error: block.is_error,
      } as ContentBlockParam;
    case 'thinking':
      return {
        type: 'thinking',
        thinking: block.thinking,
        signature: block.signature,
      } as any as ContentBlockParam;
    case 'image':
      return {
        type: 'image',
        source: block.source,
        media_type: block.media_type,
      } as ContentBlockParam;
    case 'video':
      return {
        type: 'video',
        source: block.source,
        media_type: (block as any).media_type,
      } as ContentBlockParam;
    case 'refusal':
      return {
        type: 'refusal',
        refusal: block.refusal,
      } as ContentBlockParam;
    default:
      return { type: 'text', text: '' } as ContentBlockParam;
  }
}

// ── OpenAI <-> ProviderContentBlock ───────────────────────────────────────

/**
 * Convert an OpenAI chat completion message to ProviderContentBlock[].
 * OpenAI messages have role + content (string | array).
 */
export function fromOpenAIChatMessage(msg: {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | null | undefined;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}): ProviderContentBlock[] {
  const blocks: ProviderContentBlock[] = [];

  if (msg.role === 'tool' && msg.tool_call_id) {
    blocks.push({
      type: 'tool_result',
      tool_use_id: msg.tool_call_id,
      content: msg.content ?? '',
    });
    return blocks;
  }

  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      blocks.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}'),
      });
    }
  }

  if (typeof msg.content === 'string') {
    blocks.push({ type: 'text', text: msg.content });
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part.type === 'text') {
        blocks.push({ type: 'text', text: part.text ?? '' });
      } else if (part.type === 'image_url') {
        blocks.push({ type: 'image', source: { url: part.image_url?.url } });
      }
    }
  }

  return blocks;
}

// ── Google Gemini <-> ProviderContentBlock ────────────────────────────────

/**
 * Convert a Google Gemini response part to a ProviderContentBlock.
 * Gemini parts have text, inline_data, function_call, function_response, etc.
 */
export function fromGooglePart(part: Record<string, unknown>): ProviderContentBlock | null {
  if (part.text !== undefined && part.text !== null) {
    return { type: 'text', text: String(part.text) };
  }
  if (part.functionCall) {
    const fc = part.functionCall as Record<string, unknown>;
    return {
      type: 'tool_use',
      id: String(fc.name ?? ''),
      name: String(fc.name ?? ''),
      input: (fc.args as Record<string, unknown>) ?? {},
    };
  }
  if (part.functionResponse) {
    const fr = part.functionResponse as Record<string, unknown>;
    return {
      type: 'tool_result',
      tool_use_id: String(fr.name ?? ''),
      content: fr.response,
    };
  }
  if (part.inlineData) {
    const id = part.inlineData as Record<string, unknown>;
    const mimeType = String(id.mimeType ?? '');
    if (mimeType.startsWith('video/')) {
      return {
        type: 'video',
        source: id,
        media_type: mimeType,
      };
    }
    return {
      type: 'image',
      source: id,
      media_type: mimeType,
    };
  }
  return null;
}
