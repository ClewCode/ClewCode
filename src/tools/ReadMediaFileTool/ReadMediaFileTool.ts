/**
 * ReadMediaFileTool — capability-gated media input.
 *
 * Lets the model read image and video files as multimodal content blocks.
 * The tool's availability is gated on the active model's `imageIn` / `videoIn`
 * capability so vision-free models never see the tool, avoiding wasted
 * tool_use blocks that the API would reject.
 *
 * @since 0.2.8
 */

import { readFile } from 'fs/promises';
import { stat } from 'fs/promises';
import * as path from 'path';
import { z } from 'zod/v4';
import { buildTool, type ToolDef } from '../../Tool.js';
import { getProviderModelInfo, getProviderRegistryEntry } from '../../services/ai/providerRegistry.js';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
import { MAX_OUTPUT_SIZE } from '../../utils/file.js';
import { expandPath } from '../../utils/path.js';
import { lazySchema } from '../../utils/lazySchema.js';
import type { ToolResult } from '../../Tool.js';

export const READ_MEDIA_FILE_TOOL_NAME = 'ReadMediaFile';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv']);

function getActiveProviderAndModel(): { provider: string; model: string } | null {
  try {
    const pm = ProviderManager.getInstance();
    return { provider: pm.getActiveProviderName(), model: pm.getModelForProvider() };
  } catch {
    return null;
  }
}

/**
 * Check whether the active model supports image inputs.
 */
export function activeModelSupportsImage(): boolean {
  const ctx = getActiveProviderAndModel();
  if (!ctx) return true;

  try {
    const entry = getProviderRegistryEntry(ctx.provider as any);
    const modelInfo = getProviderModelInfo(ctx.provider as any, ctx.model);

    if (modelInfo?.capabilities.imageIn !== undefined) return modelInfo.capabilities.imageIn;
    if (modelInfo) return modelInfo.capabilities.vision;
    if (entry.capabilities.imageIn !== undefined) return entry.capabilities.imageIn;
    return entry.capabilities.vision;
  } catch {
    return true;
  }
}

/**
 * Check whether the active model supports video inputs.
 */
export function activeModelSupportsVideo(): boolean {
  const ctx = getActiveProviderAndModel();
  if (!ctx) return false;

  try {
    const entry = getProviderRegistryEntry(ctx.provider as any);
    const modelInfo = getProviderModelInfo(ctx.provider as any, ctx.model);
    if (modelInfo?.capabilities.videoIn !== undefined) return modelInfo.capabilities.videoIn;
    if (entry.capabilities.videoIn !== undefined) return entry.capabilities.videoIn;
    return false;
  } catch {
    return false;
  }
}

/**
 * Human-readable description of what media types this model supports.
 */
function supportedMediaTypes(): string {
  const parts: string[] = [];
  if (activeModelSupportsImage()) parts.push('images (PNG, JPG, GIF, WebP)');
  if (activeModelSupportsVideo()) parts.push('videos (MP4, WebM, MOV, AVI, MKV)');
  return parts.length > 0 ? parts.join(' and ') : 'none';
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z.string().describe('Absolute path to the media file'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;

export type Input = z.infer<InputSchema>;

export const ReadMediaFileTool = buildTool({
  name: READ_MEDIA_FILE_TOOL_NAME,
  searchHint: 'read image and video files as multimodal content',
  maxResultSizeChars: Infinity,
  strict: true,

  get inputSchema() {
    return inputSchema();
  },

  isEnabled() {
    return activeModelSupportsImage() || activeModelSupportsVideo();
  },

  isReadOnly() {
    return true;
  },

  isConcurrencySafe() {
    return true;
  },

  async description() {
    return `Read a media file (image or video) and return its content as a multimodal block that the model can see directly. Supports ${supportedMediaTypes()} with the current provider.`;
  },

  async prompt() {
    const images = activeModelSupportsImage();
    const videos = activeModelSupportsVideo();
    const lines: string[] = [];

    if (images) {
      lines.push(
        '- ReadMediaFile can read image files (PNG, JPG, GIF, WebP). ' +
          'The image content is presented visually — use this instead of Read for any image.',
      );
    }
    if (videos) {
      lines.push(
        '- ReadMediaFile can read video files (MP4, WebM, MOV, AVI, MKV). ' +
          'The video content is presented as frames for multimodal models.',
      );
    }
    if (!images && !videos) {
      lines.push('- ReadMediaFile is not available — the current model does not support media input.');
    }
    lines.push('- The file_path parameter must be an absolute path.');
    return lines.join('\n');
  },

  async call(
    input: Input,
    _context: any,
  ): Promise<ToolResult<{ type: 'text' | 'image' | 'video'; file: Record<string, unknown> }>> {
    const { file_path } = input;

    const resolvedPath = file_path.startsWith('~') ? expandPath(file_path) : path.resolve(file_path);
    const fileStat = await stat(resolvedPath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      return { data: { type: 'text', file: { content: `File not found: ${file_path}` } }, isError: true };
    }

    if (fileStat.size > MAX_OUTPUT_SIZE) {
      return {
        data: {
          type: 'text',
          file: {
            content: `File too large (${(fileStat.size / 1024 / 1024).toFixed(1)} MB). Max: ${(MAX_OUTPUT_SIZE / 1024 / 1024).toFixed(0)} MB.`,
          },
        },
        isError: true,
      };
    }

    const ext = file_path.split('.').pop()?.toLowerCase() ?? '';

    if (IMAGE_EXTENSIONS.has(ext)) {
      if (!activeModelSupportsImage()) {
        return {
          data: { type: 'text', file: { content: 'The current model does not support image input.' } },
          isError: true,
        };
      }
      const buffer = await readFile(resolvedPath);
      const base64 = buffer.toString('base64');
      const mediaType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return {
        data: {
          type: 'image',
          file: { base64, media_type: mediaType, original_size: fileStat.size },
        },
      };
    }

    if (VIDEO_EXTENSIONS.has(ext)) {
      if (!activeModelSupportsVideo()) {
        return {
          data: { type: 'text', file: { content: 'The current model does not support video input.' } },
          isError: true,
        };
      }
      const buffer = await readFile(resolvedPath);
      const base64 = buffer.toString('base64');
      const mediaType = ext === 'mov' ? 'video/quicktime' : `video/${ext}`;
      return {
        data: {
          type: 'video',
          file: { base64, media_type: mediaType, original_size: fileStat.size },
        },
      };
    }

    return {
      data: {
        type: 'text',
        file: {
          content: `Unsupported media type: .${ext}. Supported: png, jpg, gif, webp, ${Array.from(VIDEO_EXTENSIONS).join(', ')}`,
        },
      },
      isError: true,
    };
  },

  async mapToolResultToToolResultBlockParam(result: any, toolUseID: string): Promise<any> {
    if (result.data.type === 'text') {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: result.data.file.content,
      };
    }
    if (result.data.type === 'image') {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: result.data.file.media_type,
              data: result.data.file.base64,
            },
          },
        ],
      };
    }
    if (result.data.type === 'video') {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          {
            type: 'video',
            source: {
              type: 'base64',
              media_type: result.data.file.media_type,
              data: result.data.file.base64,
            },
          },
        ],
      };
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: JSON.stringify(result.data),
    };
  },

  renderToolUseMessage(input: any) {
    return `Reading media file: ${input.file_path}`;
  },

  renderToolResultMessage(result: any) {
    if (result.data?.type === 'image')
      return `📷 Image loaded (${(result.data.file.original_size / 1024).toFixed(0)} KB)`;
    if (result.data?.type === 'video')
      return `🎬 Video loaded (${(result.data.file.original_size / 1024 / 1024).toFixed(1)} MB)`;
    return `Media file read`;
  },

  checkPermissions(_input: any, _context: any) {
    return { behavior: 'allow' as const };
  },
});
