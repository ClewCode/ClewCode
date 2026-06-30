import type { Base64ImageSource } from '@anthropic-ai/sdk/resources/index.mjs';
import { readdir, readFile as readFileAsync } from 'fs/promises';
import * as path from 'path';
import { posix, win32 } from 'path';
import { z } from 'zod/v4';
import {
  PDF_AT_MENTION_INLINE_THRESHOLD,
  PDF_EXTRACT_SIZE_THRESHOLD,
  PDF_MAX_PAGES_PER_READ,
} from '../../constants/apiLimits.js';
import { hasBinaryExtension } from '../../constants/files.js';
import { memoryFreshnessNote } from '../../memdir/memoryAge.js';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js';
import { logEvent } from '../../services/analytics/index.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  getFileExtensionForAnalytics,
} from '../../services/analytics/metadata.js';
import { countTokensWithAPI, roughTokenCountEstimationForFileType } from '../../services/tokenEstimation.js';
import {
  activateConditionalSkillsForPaths,
  addSkillDirectories,
  discoverSkillDirsForPaths,
} from '../../skills/loadSkillsDir.js';
import type { ToolUseContext } from '../../Tool.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { getClewConfigHomeDir, isEnvTruthy } from '../../utils/envUtils.js';
import { getErrnoCode, isENOENT } from '../../utils/errors.js';
import {
  addLineNumbers,
  FILE_NOT_FOUND_CWD_NOTE,
  findSimilarFile,
  getFileModificationTimeAsync,
  suggestPathUnderCwd,
} from '../../utils/file.js';
import { logFileOperation } from '../../utils/fileOperationAnalytics.js';
import { formatFileSize } from '../../utils/format.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import {
  compressImageBufferWithTokenLimit,
  createImageMetadataText,
  detectImageFormatFromBuffer,
  type ImageDimensions,
  ImageResizeError,
  maybeResizeAndDownsampleImageBuffer,
} from '../../utils/imageResizer.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { logError } from '../../utils/log.js';
import { isAutoMemFile } from '../../utils/memoryFileDetection.js';
import { createUserMessage } from '../../utils/messages.js';
import { getCanonicalName, getMainLoopModel } from '../../utils/model/model.js';
import { mapNotebookCellsToToolResult, readNotebook } from '../../utils/notebook.js';
import { expandPath } from '../../utils/path.js';
import { extractPDFPages, getPDFPageCount, readPDF } from '../../utils/pdf.js';
import { isPDFExtension, isPDFSupported, parsePDFPageRange } from '../../utils/pdfUtils.js';
import { checkReadPermissionForTool, matchingRuleForInput } from '../../utils/permissions/filesystem.js';
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js';
import { matchWildcardPattern } from '../../utils/permissions/shellRuleMatching.js';
import { readFileInRange } from '../../utils/readFileInRange.js';
import { semanticNumber } from '../../utils/semanticNumber.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import { BASH_TOOL_NAME } from 'src/tools/BashTool/toolName.js';
import { getDefaultFileReadingLimits } from './limits.js';
import {
  DESCRIPTION,
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
  LINE_FORMAT_INSTRUCTION,
  OFFSET_INSTRUCTION_DEFAULT,
  OFFSET_INSTRUCTION_TARGETED,
  renderPromptTemplate,
} from './prompt.js';
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
  renderToolUseTag,
  userFacingName,
} from './UI.js';

// Device files that would hang the process: infinite output or blocking input.
// Checked by path only (no I/O). Safe devices like /dev/null are intentionally omitted.
const BLOCKED_DEVICE_PATHS = new Set([
  // Infinite output — never reach EOF
  '/dev/zero',
  '/dev/random',
  '/dev/urandom',
  '/dev/full',
  // Blocks waiting for input
  '/dev/stdin',
  '/dev/tty',
  '/dev/console',
  // Nonsensical to read
  '/dev/stdout',
  '/dev/stderr',
  // fd aliases for stdin/stdout/stderr
  '/dev/fd/0',
  '/dev/fd/1',
  '/dev/fd/2',
]);

function isBlockedDevicePath(filePath: string): boolean {
  if (BLOCKED_DEVICE_PATHS.has(filePath)) return true;
  // /proc/self/fd/0-2 and /proc/<pid>/fd/0-2 are Linux aliases for stdio
  if (
    filePath.startsWith('/proc/') &&
    (filePath.endsWith('/fd/0') || filePath.endsWith('/fd/1') || filePath.endsWith('/fd/2'))
  )
    return true;
  return false;
}

// Narrow no-break space (U+202F) used by some macOS versions in screenshot filenames
const THIN_SPACE = String.fromCharCode(8239);

/**
 * Resolves macOS screenshot paths that may have different space characters.
 * macOS uses either regular space or thin space (U+202F) before AM/PM in screenshot
 * filenames depending on the macOS version. This function tries the alternate space
 * character if the file doesn't exist with the given path.
 *
 * @param filePath - The normalized file path to resolve
 * @returns The path to the actual file on disk (may differ in space character)
 */
/**
 * For macOS screenshot paths with AM/PM, the space before AM/PM may be a
 * regular space or a thin space depending on the macOS version.  Returns
 * the alternate path to try if the original doesn't exist, or undefined.
 */
function getAlternateScreenshotPath(filePath: string): string | undefined {
  const filename = path.basename(filePath);
  const amPmPattern = /^(.+)([ \u202F])(AM|PM)(\.png)$/;
  const match = filename.match(amPmPattern);
  if (!match) return undefined;

  const currentSpace = match[2];
  const alternateSpace = currentSpace === ' ' ? THIN_SPACE : ' ';
  return filePath.replace(`${currentSpace}${match[3]}${match[4]}`, `${alternateSpace}${match[3]}${match[4]}`);
}

// File read listeners - allows other services to be notified when files are read
type FileReadListener = (filePath: string, content: string) => void;
const fileReadListeners: FileReadListener[] = [];

export function registerFileReadListener(listener: FileReadListener): () => void {
  fileReadListeners.push(listener);
  return () => {
    const i = fileReadListeners.indexOf(listener);
    if (i >= 0) fileReadListeners.splice(i, 1);
  };
}

export class MaxFileReadTokenExceededError extends Error {
  constructor(
    public tokenCount: number,
    public maxTokens: number,
  ) {
    super(
      `File content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.`,
    );
    this.name = 'MaxFileReadTokenExceededError';
  }
}

// Common image extensions
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/**
 * Detects if a file path is a session-related file for analytics logging.
 * Only matches files within the Claude config directory (e.g., ~/.claude).
 * Returns the type of session file or null if not a session file.
 */
function detectSessionFileType(filePath: string): 'session_memory' | 'session_transcript' | null {
  const configDir = getClewConfigHomeDir();

  // Only match files within the Claude config directory
  if (!filePath.startsWith(configDir)) {
    return null;
  }

  // Normalize path to use forward slashes for consistent matching across platforms
  const normalizedPath = filePath.split(win32.sep).join(posix.sep);

  // Session memory files: ~/.clew/session-memory/*.md (including summary.md)
  if (normalizedPath.includes('/session-memory/') && normalizedPath.endsWith('.md')) {
    return 'session_memory';
  }

  // Session JSONL transcript files: ~/.clew/projects/*/*.jsonl
  if (normalizedPath.includes('/projects/') && normalizedPath.endsWith('.jsonl')) {
    return 'session_transcript';
  }

  return null;
}

const singleFileSchema = z.strictObject({
  file_path: z.string().describe('The absolute path to the file to read'),
  offset: semanticNumber(z.number().int().nonnegative().optional()).describe(
    'The line number to start reading from. Only provide if the file is too large to read at once',
  ),
  limit: semanticNumber(z.number().int().positive().optional()).describe(
    'The number of lines to read. Only provide if the file is too large to read at once.',
  ),
  pages: z
    .string()
    .optional()
    .describe(
      `Page range for PDF files (e.g., "1-5", "3", "10-20"). Only applicable to PDF files. Maximum ${PDF_MAX_PAGES_PER_READ} pages per request.`,
    ),
});

const batchFileSchema = z.strictObject({
  file_paths: z.array(z.string()).describe('Array of absolute paths to files to read in parallel'),
  offset: semanticNumber(z.number().int().nonnegative().optional()).describe(
    'The line number to start reading from (applied to all files)',
  ),
  limit: semanticNumber(z.number().int().positive().optional()).describe(
    'The number of lines to read (applied to all files)',
  ),
});

const inputSchema = lazySchema(() =>
  z
    .union([singleFileSchema, batchFileSchema])
    .describe(
      'Read a single file or multiple files in parallel. Use file_paths array to read multiple files at once for better performance.',
    ),
);
type InputSchema = ReturnType<typeof inputSchema>;

export type Input = z.infer<InputSchema>;

const outputSchema = lazySchema(() => {
  // Define the media types supported for images
  const imageMediaTypes = z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

  return z.discriminatedUnion('type', [
    z.object({
      type: z.literal('text'),
      file: z.object({
        filePath: z.string().describe('The path to the file that was read'),
        content: z.string().describe('The content of the file'),
        numLines: z.number().describe('Number of lines in the returned content'),
        startLine: z.number().describe('The starting line number'),
        totalLines: z.number().describe('Total number of lines in the file'),
      }),
    }),
    z.object({
      type: z.literal('image'),
      file: z.object({
        base64: z.string().describe('Base64-encoded image data'),
        type: imageMediaTypes.describe('The MIME type of the image'),
        originalSize: z.number().describe('Original file size in bytes'),
        dimensions: z
          .object({
            originalWidth: z.number().optional().describe('Original image width in pixels'),
            originalHeight: z.number().optional().describe('Original image height in pixels'),
            displayWidth: z.number().optional().describe('Displayed image width in pixels (after resizing)'),
            displayHeight: z.number().optional().describe('Displayed image height in pixels (after resizing)'),
          })
          .optional()
          .describe('Image dimension info for coordinate mapping'),
      }),
    }),
    z.object({
      type: z.literal('notebook'),
      file: z.object({
        filePath: z.string().describe('The path to the notebook file'),
        cells: z.array(z.any()).describe('Array of notebook cells'),
      }),
    }),
    z.object({
      type: z.literal('pdf'),
      file: z.object({
        filePath: z.string().describe('The path to the PDF file'),
        base64: z.string().describe('Base64-encoded PDF data'),
        originalSize: z.number().describe('Original file size in bytes'),
      }),
    }),
    z.object({
      type: z.literal('parts'),
      file: z.object({
        filePath: z.string().describe('The path to the PDF file'),
        originalSize: z.number().describe('Original file size in bytes'),
        count: z.number().describe('Number of pages extracted'),
        outputDir: z.string().describe('Directory containing extracted page images'),
      }),
    }),
    z.object({
      type: z.literal('file_unchanged'),
      file: z.object({
        filePath: z.string().describe('The path to the file'),
      }),
    }),
    z.object({
      type: z.literal('batch'),
      files: z
        .array(
          z.object({
            filePath: z.string().describe('The path to the file'),
            content: z.string().describe('The content of the file (or error message)'),
            numLines: z.number().describe('Number of lines in the returned content'),
            startLine: z.number().describe('The starting line number'),
            totalLines: z.number().describe('Total number of lines in the file'),
            success: z.boolean().describe('Whether this file was read successfully'),
          }),
        )
        .describe('Array of file read results'),
    }),
  ]);
});
type OutputSchema = ReturnType<typeof outputSchema>;

export type Output = z.infer<OutputSchema>;

export const FileReadTool = buildTool({
  name: FILE_READ_TOOL_NAME,
  searchHint: 'read files, images, PDFs, notebooks',
  // Output is bounded by maxTokens (validateContentTokens). Persisting to a
  // file the model reads back with Read is circular — never persist.
  maxResultSizeChars: Infinity,
  strict: true,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    const limits = getDefaultFileReadingLimits();
    const maxSizeInstruction = limits.includeMaxSizeInPrompt
      ? `. Files larger than ${formatFileSize(limits.maxSizeBytes)} will return an error; use offset and limit for larger files`
      : '';
    const offsetInstruction = limits.targetedRangeNudge ? OFFSET_INSTRUCTION_TARGETED : OFFSET_INSTRUCTION_DEFAULT;
    return renderPromptTemplate(pickLineFormatInstruction(), maxSizeInstruction, offsetInstruction);
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  userFacingName,
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input);
    return summary ? `Reading ${summary}` : 'Reading file';
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  toAutoClassifierInput(input) {
    return input.file_path;
  },
  isSearchOrReadCommand() {
    return { isSearch: false, isRead: true };
  },
  getPath({ file_path }): string {
    return file_path || getCwd();
  },
  backfillObservableInput(input) {
    // hooks.mdx documents file_path as absolute; expand so hook allowlists
    // can't be bypassed via ~ or relative paths.
    if (typeof input.file_path === 'string') {
      input.file_path = expandPath(input.file_path);
    }
  },
  async preparePermissionMatcher({ file_path }) {
    return pattern => matchWildcardPattern(pattern, file_path);
  },
  async checkPermissions(input, context): Promise<PermissionResult> {
    const appState = context.getAppState();
    return checkReadPermissionForTool(FileReadTool, input, appState.toolPermissionContext);
  },
  renderToolUseMessage,
  renderToolUseTag,
  renderToolResultMessage,
  // UI.tsx:140 — ALL types render summary chrome only: "Read N lines",
  // "Read image (42KB)". Never the content itself. The model-facing
  // serialization (below) sends content + CYBER_RISK_MITIGATION_REMINDER
  // + line prefixes; UI shows none of it. Nothing to index. Caught by
  // the render-fidelity test when this initially claimed file.content.
  extractSearchText() {
    return '';
  },
  renderToolUseErrorMessage,
  async validateInput({ file_path, pages }, toolUseContext: ToolUseContext) {
    // Validate pages parameter (pure string parsing, no I/O)
    if (pages !== undefined) {
      const parsed = parsePDFPageRange(pages);
      if (!parsed) {
        return {
          result: false,
          message: `Invalid pages parameter: "${pages}". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed.`,
          errorCode: 7,
        };
      }
      const rangeSize =
        parsed.lastPage === Infinity ? PDF_MAX_PAGES_PER_READ + 1 : parsed.lastPage - parsed.firstPage + 1;
      if (rangeSize > PDF_MAX_PAGES_PER_READ) {
        return {
          result: false,
          message: `Page range "${pages}" exceeds maximum of ${PDF_MAX_PAGES_PER_READ} pages per request. Please use a smaller range.`,
          errorCode: 8,
        };
      }
    }

    // Path expansion + deny rule check (no I/O)
    const fullFilePath = expandPath(file_path);

    const appState = toolUseContext.getAppState();
    const denyRule = matchingRuleForInput(fullFilePath, appState.toolPermissionContext, 'read', 'deny');
    if (denyRule !== null) {
      return {
        result: false,
        message: 'File is in a directory that is denied by your permission settings.',
        errorCode: 1,
      };
    }

    // SECURITY: UNC path check (no I/O) — defer filesystem operations
    // until after user grants permission to prevent NTLM credential leaks
    const isUncPath = fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//');
    if (isUncPath) {
      return { result: true };
    }

    // Binary extension check (string check on extension only, no I/O).
    // PDF, images, and SVG are excluded - this tool renders them natively.
    const ext = path.extname(fullFilePath).toLowerCase();
    if (hasBinaryExtension(fullFilePath) && !isPDFExtension(ext) && !IMAGE_EXTENSIONS.has(ext.slice(1))) {
      return {
        result: false,
        message: `This tool cannot read binary files. The file appears to be a binary ${ext} file. Please use appropriate tools for binary file analysis.`,
        errorCode: 4,
      };
    }

    // Block specific device files that would hang (infinite output or blocking input).
    // This is a path-based check with no I/O — safe special files like /dev/null are allowed.
    if (isBlockedDevicePath(fullFilePath)) {
      return {
        result: false,
        message: `Cannot read '${file_path}': this device file would block or produce infinite output.`,
        errorCode: 9,
      };
    }

    return { result: true };
  },
  async call(input, context, _canUseTool?, parentMessage?) {
    const { readFileState, fileReadingLimits } = context;

    const defaults = getDefaultFileReadingLimits();
    const maxSizeBytes = fileReadingLimits?.maxSizeBytes ?? defaults.maxSizeBytes;
    const maxTokens = fileReadingLimits?.maxTokens ?? defaults.maxTokens;

    // Check if this is a batch read (file_paths) or single file read (file_path)
    const isBatchRead = 'file_paths' in input && Array.isArray(input.file_paths);

    if (isBatchRead) {
      // Batch read: read multiple files in parallel
      const { file_paths, offset = 1, limit = undefined } = input;

      // Telemetry
      logEvent('tengu_file_read_batch', {
        fileCount: file_paths.length,
      });

      // Read all files in parallel
      const results = await Promise.all(
        file_paths.map(async file_path => {
          try {
            const result = await readSingleFile(
              file_path,
              offset,
              limit,
              undefined, // no pages for batch read
              maxSizeBytes,
              maxTokens,
              readFileState,
              context,
              parentMessage?.message.id,
            );
            return {
              filePath: file_path,
              success: true,
              ...result,
            };
          } catch (error) {
            return {
              filePath: file_path,
              success: false,
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
              numLines: 0,
              startLine: 1,
              totalLines: 0,
            };
          }
        }),
      );

      return {
        data: {
          type: 'batch' as const,
          files: results,
        },
      };
    }

    // Single file read (original logic)
    const { file_path, offset = 1, limit = undefined, pages } = input;

    // Telemetry: track when callers override default read limits.
    if (fileReadingLimits !== undefined) {
      logEvent('tengu_file_read_limits_override', {
        hasMaxTokens: fileReadingLimits.maxTokens !== undefined,
        hasMaxSizeBytes: fileReadingLimits.maxSizeBytes !== undefined,
      });
    }

    const ext = path.extname(file_path).toLowerCase().slice(1);
    const fullFilePath = expandPath(file_path);

    // Dedup check (existing logic)
    const dedupKillswitch = getFeatureValue_CACHED_MAY_BE_STALE('tengu_read_dedup_killswitch', false);
    const existingState = dedupKillswitch ? undefined : readFileState.get(fullFilePath);
    if (existingState && !existingState.isPartialView && existingState.offset !== undefined) {
      const rangeMatch = existingState.offset === offset && existingState.limit === limit;
      if (rangeMatch) {
        try {
          const mtimeMs = await getFileModificationTimeAsync(fullFilePath);
          if (mtimeMs === existingState.timestamp) {
            const analyticsExt = getFileExtensionForAnalytics(fullFilePath);
            logEvent('tengu_file_read_dedup', {
              ...(analyticsExt !== undefined && { ext: analyticsExt }),
            });
            return {
              data: {
                type: 'file_unchanged' as const,
                file: { filePath: file_path },
              },
            };
          }
        } catch {
          // stat failed — fall through to full read
        }
      }
    }

    // Discover skills from this file's path
    const cwd = getCwd();
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
      const newSkillDirs = await discoverSkillDirsForPaths([fullFilePath], cwd);
      if (newSkillDirs.length > 0) {
        for (const dir of newSkillDirs) {
          context.dynamicSkillDirTriggers?.add(dir);
        }
        addSkillDirectories(newSkillDirs).catch(() => {});
      }
      activateConditionalSkillsForPaths([fullFilePath], cwd);
    }

    try {
      return await callInner(
        file_path,
        fullFilePath,
        fullFilePath,
        ext,
        offset,
        limit,
        pages,
        maxSizeBytes,
        maxTokens,
        readFileState,
        context,
        parentMessage?.message.id,
      );
    } catch (error) {
      // Handle file-not-found: suggest similar files
      const code = getErrnoCode(error);
      if (code === 'ENOENT') {
        const altPath = getAlternateScreenshotPath(fullFilePath);
        if (altPath) {
          try {
            return await callInner(
              file_path,
              fullFilePath,
              altPath,
              ext,
              offset,
              limit,
              pages,
              maxSizeBytes,
              maxTokens,
              readFileState,
              context,
              parentMessage?.message.id,
            );
          } catch (altError) {
            if (!isENOENT(altError)) {
              throw altError;
            }
          }
        }

        const similarFilename = findSimilarFile(fullFilePath);
        const cwdSuggestion = await suggestPathUnderCwd(fullFilePath);
        let message = `File does not exist. ${FILE_NOT_FOUND_CWD_NOTE} ${getCwd()}.`;
        if (cwdSuggestion) {
          message += ` Did you mean ${cwdSuggestion}?`;
        } else if (similarFilename) {
          message += ` Did you mean ${similarFilename}?`;
        }
        throw new Error(message);
      }
      throw error;
    }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    switch (data.type) {
      case 'image': {
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                data: data.file.base64,
                media_type: data.file.type,
              },
            },
          ],
        };
      }
      case 'notebook':
        return mapNotebookCellsToToolResult(data.file.cells, toolUseID);
      case 'pdf':
        // Return PDF metadata only - the actual content is sent as a supplemental DocumentBlockParam
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `PDF file read: ${data.file.filePath} (${formatFileSize(data.file.originalSize)})`,
        };
      case 'parts':
        // Extracted page images are read and sent as image blocks in mapToolResultToAPIMessage
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: `PDF pages extracted: ${data.file.count} page(s) from ${data.file.filePath} (${formatFileSize(data.file.originalSize)})`,
        };
      case 'file_unchanged':
        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: FILE_UNCHANGED_STUB,
        };
      case 'text': {
        let content: string;

        if (data.file.content) {
          content =
            memoryFileFreshnessPrefix(data) +
            formatFileLines(data.file) +
            (shouldIncludeFileReadMitigation() ? CYBER_RISK_MITIGATION_REMINDER : '');
        } else {
          // Determine the appropriate warning message
          content =
            data.file.totalLines === 0
              ? '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>'
              : `<system-reminder>Warning: the file exists but is shorter than the provided offset (${data.file.startLine}). The file has ${data.file.totalLines} lines.</system-reminder>`;
        }

        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content,
        };
      }
      case 'batch': {
        // Format batch results as combined text
        const combinedContent = data.files
          .map(file => {
            if (!file.success) {
              return `--- ${file.filePath} ---\nError: ${file.content}\n`;
            }
            const lineInfo =
              file.totalLines > 0
                ? ` (lines ${file.startLine}-${file.startLine + file.numLines - 1} of ${file.totalLines})`
                : '';
            return `--- ${file.filePath}${lineInfo} ---\n${file.content}\n`;
          })
          .join('\n');

        return {
          tool_use_id: toolUseID,
          type: 'tool_result',
          content: combinedContent,
        };
      }
    }
  },
} satisfies ToolDef<InputSchema, Output>);

function pickLineFormatInstruction(): string {
  return LINE_FORMAT_INSTRUCTION;
}

/** Format file content with line numbers. */
function formatFileLines(file: { content: string; startLine: number }): string {
  return addLineNumbers(file);
}

export const CYBER_RISK_MITIGATION_REMINDER =
  '\n\n<system-reminder>\nWhenever you read a file, you should consider whether it would be considered malware. You CAN and SHOULD provide analysis of malware, what it is doing. But you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer questions about the code behavior.\n</system-reminder>\n';

// Models where cyber risk mitigation should be skipped (using canonical short names)
const MITIGATION_EXEMPT_MODELS = new Set([
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-sonnet-4-7',
  'claude-3-5-sonnet',
  'claude-3-7-sonnet',
]);

function shouldIncludeFileReadMitigation(): boolean {
  try {
    const pm = ProviderManager.getInstance();
    if (pm.getActiveProviderName() !== 'anthropic') {
      return false;
    }
  } catch {
    // Fallback if ProviderManager is not fully initialized
  }
  const shortName = getCanonicalName(getMainLoopModel());
  return !MITIGATION_EXEMPT_MODELS.has(shortName);
}

/**
 * Side-channel from call() to mapToolResultToToolResultBlockParam: mtime
 * of auto-memory files, keyed by the `data` object identity. Avoids
 * adding a presentation-only field to the output schema (which flows
 * into SDK types) and avoids sync fs in the mapper. WeakMap auto-GCs
 * when the data object becomes unreachable after rendering.
 */
const memoryFileMtimes = new WeakMap<object, number>();

function memoryFileFreshnessPrefix(data: object): string {
  const mtimeMs = memoryFileMtimes.get(data);
  if (mtimeMs === undefined) return '';
  return memoryFreshnessNote(mtimeMs);
}

async function validateContentTokens(content: string, ext: string, maxTokens?: number): Promise<void> {
  const effectiveMaxTokens = maxTokens ?? getDefaultFileReadingLimits().maxTokens;

  const tokenEstimate = roughTokenCountEstimationForFileType(content, ext);
  if (!tokenEstimate || tokenEstimate <= effectiveMaxTokens / 4) return;

  const tokenCount = await countTokensWithAPI(content);
  const effectiveCount = tokenCount ?? tokenEstimate;

  if (effectiveCount > effectiveMaxTokens) {
    throw new MaxFileReadTokenExceededError(effectiveCount, effectiveMaxTokens);
  }
}

type ImageResult = {
  type: 'image';
  file: {
    base64: string;
    type: Base64ImageSource['media_type'];
    originalSize: number;
    dimensions?: ImageDimensions;
  };
};

function createImageResponse(
  buffer: Buffer,
  mediaType: string,
  originalSize: number,
  dimensions?: ImageDimensions,
): ImageResult {
  return {
    type: 'image',
    file: {
      base64: buffer.toString('base64'),
      type: `image/${mediaType}` as Base64ImageSource['media_type'],
      originalSize,
      dimensions,
    },
  };
}

/**
 * Inner implementation of call, separated to allow ENOENT handling in the outer call.
 */
async function callInner(
  file_path: string,
  fullFilePath: string,
  resolvedFilePath: string,
  ext: string,
  offset: number,
  limit: number | undefined,
  pages: string | undefined,
  maxSizeBytes: number,
  maxTokens: number,
  readFileState: ToolUseContext['readFileState'],
  context: ToolUseContext,
  messageId: string | undefined,
): Promise<{
  data: Output;
  newMessages?: ReturnType<typeof createUserMessage>[];
}> {
  // --- Notebook ---
  if (ext === 'ipynb') {
    const cells = await readNotebook(resolvedFilePath);
    const cellsJson = jsonStringify(cells);

    const cellsJsonBytes = Buffer.byteLength(cellsJson);
    if (cellsJsonBytes > maxSizeBytes) {
      throw new Error(
        `Notebook content (${formatFileSize(cellsJsonBytes)}) exceeds maximum allowed size (${formatFileSize(maxSizeBytes)}). ` +
          `Use ${BASH_TOOL_NAME} with jq to read specific portions:\n` +
          `  cat "${file_path}" | jq '.cells[:20]' # First 20 cells\n` +
          `  cat "${file_path}" | jq '.cells[100:120]' # Cells 100-120\n` +
          `  cat "${file_path}" | jq '.cells | length' # Count total cells\n` +
          `  cat "${file_path}" | jq '.cells[] | select(.cell_type=="code") | .source' # All code sources`,
      );
    }

    await validateContentTokens(cellsJson, ext, maxTokens);

    // Get mtime via async stat (single call, no prior existence check)
    const stats = await getFsImplementation().stat(resolvedFilePath);
    readFileState.set(fullFilePath, {
      content: cellsJson,
      timestamp: Math.floor(stats.mtimeMs),
      offset,
      limit,
    });
    context.nestedMemoryAttachmentTriggers?.add(fullFilePath);

    const data = {
      type: 'notebook' as const,
      file: { filePath: file_path, cells },
    };

    logFileOperation({
      operation: 'read',
      tool: 'FileReadTool',
      filePath: fullFilePath,
      content: cellsJson,
    });

    return { data };
  }

  // --- Image (single read, no double-read) ---
  if (IMAGE_EXTENSIONS.has(ext)) {
    // Images have their own size limits (token budget + compression) —
    // don't apply the text maxSizeBytes cap.
    try {
      const data = await readImageWithTokenBudget(resolvedFilePath, maxTokens);
      context.nestedMemoryAttachmentTriggers?.add(fullFilePath);

      logFileOperation({
        operation: 'read',
        tool: 'FileReadTool',
        filePath: fullFilePath,
        content: data.file.base64,
      });

      const metadataText = data.file.dimensions ? createImageMetadataText(data.file.dimensions) : null;

      return {
        data,
        ...(metadataText && {
          newMessages: [createUserMessage({ content: metadataText, isMeta: true })],
        }),
      };
    } catch {
      // File has an image extension but couldn't be decoded as an image
      // (e.g. HTML saved as .png). Fall back to reading as text.
    }
  }

  // --- PDF ---
  if (isPDFExtension(ext)) {
    if (pages) {
      const parsedRange = parsePDFPageRange(pages);
      const extractResult = await extractPDFPages(resolvedFilePath, parsedRange ?? undefined);
      if (!extractResult.success) {
        throw new Error(extractResult.error.message);
      }
      logEvent('tengu_pdf_page_extraction', {
        success: true,
        pageCount: extractResult.data.file.count,
        fileSize: extractResult.data.file.originalSize,
        hasPageRange: true,
      });
      logFileOperation({
        operation: 'read',
        tool: 'FileReadTool',
        filePath: fullFilePath,
        content: `PDF pages ${pages}`,
      });
      const entries = await readdir(extractResult.data.file.outputDir);
      const imageFiles = entries.filter(f => f.endsWith('.jpg')).sort();
      const imageBlocks = await Promise.all(
        imageFiles.map(async f => {
          const imgPath = path.join(extractResult.data.file.outputDir, f);
          const imgBuffer = await readFileAsync(imgPath);
          const resized = await maybeResizeAndDownsampleImageBuffer(imgBuffer, imgBuffer.length, 'jpeg');
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: `image/${resized.mediaType}` as Base64ImageSource['media_type'],
              data: resized.buffer.toString('base64'),
            },
          };
        }),
      );
      return {
        data: extractResult.data,
        ...(imageBlocks.length > 0 && {
          newMessages: [createUserMessage({ content: imageBlocks, isMeta: true })],
        }),
      };
    }

    const pageCount = await getPDFPageCount(resolvedFilePath);
    if (pageCount !== null && pageCount > PDF_AT_MENTION_INLINE_THRESHOLD) {
      throw new Error(
        `This PDF has ${pageCount} pages, which is too many to read at once. ` +
          `Use the pages parameter to read specific page ranges (e.g., pages: "1-5"). ` +
          `Maximum ${PDF_MAX_PAGES_PER_READ} pages per request.`,
      );
    }

    const fs = getFsImplementation();
    const stats = await fs.stat(resolvedFilePath);
    const shouldExtractPages = !isPDFSupported() || stats.size > PDF_EXTRACT_SIZE_THRESHOLD;

    if (shouldExtractPages) {
      const extractResult = await extractPDFPages(resolvedFilePath);
      if (extractResult.success) {
        logEvent('tengu_pdf_page_extraction', {
          success: true,
          pageCount: extractResult.data.file.count,
          fileSize: extractResult.data.file.originalSize,
        });
      } else {
        logEvent('tengu_pdf_page_extraction', {
          success: false,
          available: extractResult.error.reason !== 'unavailable',
          fileSize: stats.size,
        });
      }
    }

    if (!isPDFSupported()) {
      throw new Error(
        'Reading full PDFs is not supported with this model. Use a newer model (Sonnet 3.5 v2 or later), ' +
          `or use the pages parameter to read specific page ranges (e.g., pages: "1-5", maximum ${PDF_MAX_PAGES_PER_READ} pages per request). ` +
          'Page extraction requires poppler-utils: install with `brew install poppler` on macOS or `apt-get install poppler-utils` on Debian/Ubuntu.',
      );
    }

    const readResult = await readPDF(resolvedFilePath);
    if (!readResult.success) {
      throw new Error(readResult.error.message);
    }
    const pdfData = readResult.data;
    logFileOperation({
      operation: 'read',
      tool: 'FileReadTool',
      filePath: fullFilePath,
      content: pdfData.file.base64,
    });

    return {
      data: pdfData,
      newMessages: [
        createUserMessage({
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfData.file.base64,
              },
            },
          ],
          isMeta: true,
        }),
      ],
    };
  }

  // --- Text file (single async read via readFileInRange) ---
  const lineOffset = offset === 0 ? 0 : offset - 1;
  const { content, lineCount, totalLines, totalBytes, readBytes, mtimeMs } = await readFileInRange(
    resolvedFilePath,
    lineOffset,
    limit,
    limit === undefined ? maxSizeBytes : undefined,
    context.abortController.signal,
  );

  await validateContentTokens(content, ext, maxTokens);

  readFileState.set(fullFilePath, {
    content,
    timestamp: Math.floor(mtimeMs),
    offset,
    limit,
  });
  context.nestedMemoryAttachmentTriggers?.add(fullFilePath);

  // Snapshot before iterating — a listener that unsubscribes mid-callback
  // would splice the live array and skip the next listener.
  for (const listener of fileReadListeners.slice()) {
    listener(resolvedFilePath, content);
  }

  const data = {
    type: 'text' as const,
    file: {
      filePath: file_path,
      content,
      numLines: lineCount,
      startLine: offset,
      totalLines,
    },
  };
  if (isAutoMemFile(fullFilePath)) {
    memoryFileMtimes.set(data, mtimeMs);
  }

  logFileOperation({
    operation: 'read',
    tool: 'FileReadTool',
    filePath: fullFilePath,
    content,
  });

  const sessionFileType = detectSessionFileType(fullFilePath);
  const analyticsExt = getFileExtensionForAnalytics(fullFilePath);
  logEvent('tengu_session_file_read', {
    totalLines,
    readLines: lineCount,
    totalBytes,
    readBytes,
    offset,
    ...(limit !== undefined && { limit }),
    ...(analyticsExt !== undefined && { ext: analyticsExt }),
    ...(messageId !== undefined && {
      messageID: messageId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }),
    is_session_memory: sessionFileType === 'session_memory',
    is_session_transcript: sessionFileType === 'session_transcript',
  });

  return { data };
}

/**
 * Reads an image file and applies token-based compression if needed.
 * Reads the file ONCE, then applies standard resize. If the result exceeds
 * the token limit, applies aggressive compression from the same buffer.
 *
 * @param filePath - Path to the image file
 * @param maxTokens - Maximum token budget for the image
 * @returns Image data with appropriate compression applied
 */
export async function readImageWithTokenBudget(
  filePath: string,
  maxTokens: number = getDefaultFileReadingLimits().maxTokens,
  maxBytes?: number,
): Promise<ImageResult> {
  // Read file ONCE — capped to maxBytes to avoid OOM on huge files
  const imageBuffer = await getFsImplementation().readFileBytes(filePath, maxBytes);
  const originalSize = imageBuffer.length;

  if (originalSize === 0) {
    throw new Error(`Image file is empty: ${filePath}`);
  }

  const detectedMediaType = detectImageFormatFromBuffer(imageBuffer);
  const detectedFormat = detectedMediaType.split('/')[1] || 'png';

  // Try standard resize
  let result: ImageResult;
  try {
    const resized = await maybeResizeAndDownsampleImageBuffer(imageBuffer, originalSize, detectedFormat);
    result = createImageResponse(resized.buffer, resized.mediaType, originalSize, resized.dimensions);
  } catch (e) {
    if (e instanceof ImageResizeError) throw e;
    logError(e);
    result = createImageResponse(imageBuffer, detectedFormat, originalSize);
  }

  // Check if it fits in token budget
  const estimatedTokens = Math.ceil(result.file.base64.length * 0.125);
  if (estimatedTokens > maxTokens) {
    // Aggressive compression from the SAME buffer (no re-read)
    try {
      const compressed = await compressImageBufferWithTokenLimit(imageBuffer, maxTokens, detectedMediaType);
      return {
        type: 'image',
        file: {
          base64: compressed.base64,
          type: compressed.mediaType,
          originalSize,
        },
      };
    } catch (e) {
      logError(e);
      // Fallback: heavily compressed version from the SAME buffer
      try {
        const sharpModule = await import('sharp');
        const sharp =
          (
            sharpModule as {
              default?: typeof sharpModule;
            } & typeof sharpModule
          ).default || sharpModule;

        const fallbackBuffer = await sharp(imageBuffer)
          .resize(400, 400, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 20 })
          .toBuffer();

        return createImageResponse(fallbackBuffer, 'jpeg', originalSize);
      } catch (error) {
        logError(error);
        return createImageResponse(imageBuffer, detectedFormat, originalSize);
      }
    }
  }

  return result;
}

/**
 * Helper function for batch file reading.
 * Reads a single text file and returns simplified result for batch processing.
 * Only handles text files (not images, PDFs, or notebooks).
 */
async function readSingleFile(
  file_path: string,
  offset: number,
  limit: number | undefined,
  _pages: string | undefined,
  maxSizeBytes: number,
  maxTokens: number,
  readFileState: ToolUseContext['readFileState'],
  context: ToolUseContext,
  _messageId: string | undefined,
): Promise<{
  content: string;
  numLines: number;
  startLine: number;
  totalLines: number;
}> {
  const fullFilePath = expandPath(file_path);
  const ext = path.extname(file_path).toLowerCase().slice(1);

  // For batch reads, we only support text files
  if (IMAGE_EXTENSIONS.has(ext)) {
    throw new Error('Images not supported in batch read. Use single file read.');
  }
  if (isPDFExtension(ext)) {
    throw new Error('PDFs not supported in batch read. Use single file read.');
  }
  if (ext === 'ipynb') {
    throw new Error('Notebooks not supported in batch read. Use single file read.');
  }

  // Check for blocked device paths
  if (isBlockedDevicePath(fullFilePath)) {
    throw new Error('Cannot read device file.');
  }

  // Dedup check
  const dedupKillswitch = getFeatureValue_CACHED_MAY_BE_STALE('tengu_read_dedup_killswitch', false);
  const existingState = dedupKillswitch ? undefined : readFileState.get(fullFilePath);
  if (
    existingState &&
    !existingState.isPartialView &&
    existingState.offset !== undefined &&
    existingState.offset === offset &&
    existingState.limit === limit
  ) {
    try {
      const mtimeMs = await getFileModificationTimeAsync(fullFilePath);
      if (mtimeMs === existingState.timestamp) {
        return {
          content: existingState.content,
          numLines: existingState.content.split('\n').length,
          startLine: offset,
          totalLines: existingState.content.split('\n').length,
        };
      }
    } catch {
      // Fall through to full read
    }
  }

  // Read text file
  const lineOffset = offset === 0 ? 0 : offset - 1;
  const { content, lineCount, totalLines, mtimeMs } = await readFileInRange(
    fullFilePath,
    lineOffset,
    limit,
    limit === undefined ? maxSizeBytes : undefined,
    context.abortController.signal,
  );

  // Validate tokens
  await validateContentTokens(content, ext, maxTokens);

  // Update state
  readFileState.set(fullFilePath, {
    content,
    timestamp: Math.floor(mtimeMs),
    offset,
    limit,
  });
  context.nestedMemoryAttachmentTriggers?.add(fullFilePath);

  // Notify listeners
  for (const listener of fileReadListeners.slice()) {
    listener(fullFilePath, content);
  }

  // Log
  logFileOperation({
    operation: 'read',
    tool: 'FileReadTool',
    filePath: fullFilePath,
    content,
  });

  return {
    content,
    numLines: lineCount,
    startLine: offset,
    totalLines,
  };
}
