import pMap from 'p-map';
import * as path from 'path';
import React from 'react';
import { z } from 'zod/v4';
import { MessageResponse } from '../../components/MessageResponse.js';
import { hasBinaryExtension } from '../../constants/files.js';
import { Box, Text } from '../../ink.js';
import { countTokensWithAPI, roughTokenCountEstimationForFileType } from '../../services/tokenEstimation.js';
import { buildTool, type ToolDef, type ToolUseContext } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { isENOENT } from '../../utils/errors.js';
import { addLineNumbers, getFileModificationTime, writeTextContent } from '../../utils/file.js';
import { readFileSyncWithMetadata } from '../../utils/fileRead.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { parallelSearch, type SearchTask } from '../../utils/parallelSearch.js';
import { expandPath, toRelativePath } from '../../utils/path.js';
import {
  checkReadPermissionForTool,
  checkWritePermissionForTool,
  matchingRuleForInput,
} from '../../utils/permissions/filesystem.js';
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js';
import { readFileInRange } from '../../utils/readFileInRange.js';
import { clearAllCache } from '../../utils/searchCache.js';
import { semanticBoolean } from '../../utils/semanticBoolean.js';
import { semanticNumber } from '../../utils/semanticNumber.js';
import { FileEditTool } from '../FileEditTool/FileEditTool.js';
import { findActualString, getPatchForEdit, preserveQuoteStyle } from '../FileEditTool/utils.js';
import { getDefaultFileReadingLimits } from '../FileReadTool/limits.js';
import { FileWriteTool } from '../FileWriteTool/FileWriteTool.js';

// Device files that would hang the process: infinite output or blocking input.
const BLOCKED_DEVICE_PATHS = new Set([
  '/dev/zero',
  '/dev/random',
  '/dev/urandom',
  '/dev/full',
  '/dev/stdin',
  '/dev/tty',
  '/dev/console',
  '/dev/stdout',
  '/dev/stderr',
  '/dev/fd/0',
  '/dev/fd/1',
  '/dev/fd/2',
]);

function isBlockedDevicePath(filePath: string): boolean {
  if (BLOCKED_DEVICE_PATHS.has(filePath)) return true;
  if (
    filePath.startsWith('/proc/') &&
    (filePath.endsWith('/fd/0') || filePath.endsWith('/fd/1') || filePath.endsWith('/fd/2'))
  )
    return true;
  return false;
}

const searchTaskSchema = z.object({
  pattern: z.string().describe('The regular expression pattern to search for'),
  path: z.string().optional().describe('File or directory to search in. Defaults to workspace root.'),
  glob: z.string().optional().describe('Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}")'),
  type: z.string().optional().describe('File type to filter (e.g. "js", "py", "rust")'),
  output_mode: z
    .enum(['content', 'files_with_matches', 'count'])
    .optional()
    .default('files_with_matches')
    .describe(
      'Output mode: "content" (matching lines), "files_with_matches" (only file paths), or "count" (match count per file)',
    ),
  head_limit: semanticNumber(z.number().optional()).describe(
    'Limit output results (defaults to 100). 0 for unlimited.',
  ),
  offset: semanticNumber(z.number().optional()).describe('Skip first N results'),
  multiline: semanticBoolean(z.boolean().optional()).describe('Enable multiline mode'),
  case_insensitive: semanticBoolean(z.boolean().optional()).describe('Case insensitive search'),
});

const readTaskSchema = z.object({
  file_path: z.string().describe('Absolute path of file to read'),
  offset: semanticNumber(z.number().int().nonnegative().optional()).describe(
    'The line number to start reading from (1-indexed). Defaults to 1.',
  ),
  limit: semanticNumber(z.number().int().positive().optional()).describe('The number of lines to read. Optional.'),
});

const writeTaskSchema = z.object({
  file_path: z.string().describe('Absolute path of file to write'),
  content: z.string().describe('The content to write to the file'),
});

const editTaskSchema = z.object({
  file_path: z.string().describe('Absolute path of file to edit'),
  old_string: z.string().describe('The exact string block in the file to replace'),
  new_string: z.string().describe('The replacement string block'),
  replace_all: semanticBoolean(z.boolean().optional()).describe(
    'Whether to replace all occurrences instead of only the first one (defaults to false)',
  ),
});

const inputSchema = lazySchema(() =>
  z
    .strictObject({
      searches: z.array(searchTaskSchema).optional().describe('List of search tasks to run concurrently'),
      reads: z.array(readTaskSchema).optional().describe('List of file read tasks to run concurrently'),
      writes: z.array(writeTaskSchema).optional().describe('List of file write tasks to run concurrently'),
      edits: z.array(editTaskSchema).optional().describe('List of file edit tasks to run concurrently'),
    })
    .describe('Run multiple searches, reads, writes, and edits concurrently in parallel.'),
);

type InputSchema = ReturnType<typeof inputSchema>;
type Input = z.infer<InputSchema>;

type SearchResultItem = {
  pattern: string;
  path?: string;
  output_mode: 'content' | 'files_with_matches' | 'count';
  results: string[];
  success: boolean;
  error?: string;
};

type ReadResultItem = {
  filePath: string;
  content: string;
  numLines: number;
  startLine: number;
  totalLines: number;
  success: boolean;
  error?: string;
};

type WriteResultItem = {
  filePath: string;
  success: boolean;
  error?: string;
  type: 'create' | 'update';
};

type EditResultItem = {
  filePath: string;
  success: boolean;
  error?: string;
};

type Output = {
  searches: SearchResultItem[];
  reads: ReadResultItem[];
  writes: WriteResultItem[];
  edits: EditResultItem[];
};

export const ParallelSearchReadTool = buildTool({
  name: 'ParallelSearchRead',
  searchHint: 'run multiple regex searches, file reads, writes, and edits in parallel',
  maxResultSizeChars: Infinity,
  strict: true,

  async description() {
    return 'Run multiple search tasks, file read tasks, writes, and edits concurrently in parallel. This is significantly faster than executing them sequentially.';
  },

  async prompt() {
    return `Use ParallelSearchRead to execute multiple search, read, write, and edit tasks in parallel.
You can specify "searches", "reads", "writes", and "edits" arrays.
Write tasks overwrite the whole file, while edit tasks replace specified strings.
To edit/write securely and concurrently, different files are processed in parallel, while operations on the same file are executed sequentially.`;
  },

  get inputSchema(): InputSchema {
    return inputSchema();
  },

  userFacingName() {
    return 'Parallel Search, Read, Write & Edit';
  },

  getToolUseSummary(input: Partial<Input> | undefined) {
    if (!input) return null;
    const numSearches = input.searches?.length ?? 0;
    const numReads = input.reads?.length ?? 0;
    const numWrites = input.writes?.length ?? 0;
    const numEdits = input.edits?.length ?? 0;
    return `${numSearches} searches, ${numReads} reads, ${numWrites} writes, ${numEdits} edits`;
  },

  getActivityDescription(input: Partial<Input> | undefined) {
    if (!input) return 'Executing parallel tasks';
    const numSearches = input.searches?.length ?? 0;
    const numReads = input.reads?.length ?? 0;
    const numWrites = input.writes?.length ?? 0;
    const numEdits = input.edits?.length ?? 0;
    return `Running parallel file ops: ${numSearches} searches, ${numReads} reads, ${numWrites} writes, ${numEdits} edits`;
  },

  isConcurrencySafe() {
    return true;
  },

  isReadOnly(input: Input) {
    const hasWrites = input.writes && input.writes.length > 0;
    const hasEdits = input.edits && input.edits.length > 0;
    return !hasWrites && !hasEdits;
  },

  toAutoClassifierInput(input: Input) {
    return {
      searches: input.searches?.map(s => ({ pattern: s.pattern, path: s.path })),
      reads: input.reads?.map(r => r.file_path),
      writes: input.writes?.map(w => w.file_path),
      edits: input.edits?.map(e => ({ file_path: e.file_path, old_string: e.old_string, new_string: e.new_string })),
    };
  },

  isSearchOrReadCommand(input: Input) {
    return { isSearch: true, isRead: true, isList: false };
  },

  getPath(input: Input): string {
    if (input.reads && input.reads.length > 0) {
      return expandPath(input.reads[0]!.file_path) || getCwd();
    }
    if (input.writes && input.writes.length > 0) {
      return expandPath(input.writes[0]!.file_path) || getCwd();
    }
    if (input.edits && input.edits.length > 0) {
      return expandPath(input.edits[0]!.file_path) || getCwd();
    }
    if (input.searches && input.searches.length > 0) {
      return expandPath(input.searches[0]!.path || '') || getCwd();
    }
    return getCwd();
  },

  async validateInput(input: Input, toolUseContext: ToolUseContext) {
    const totalTasks =
      (input.searches?.length ?? 0) +
      (input.reads?.length ?? 0) +
      (input.writes?.length ?? 0) +
      (input.edits?.length ?? 0);

    if (totalTasks === 0) {
      return {
        result: false,
        message: 'Must provide at least one search, read, write, or edit task.',
        errorCode: 1,
      };
    }

    if (input.reads) {
      for (const r of input.reads) {
        const fullPath = expandPath(r.file_path);
        if (fullPath.startsWith('\\\\') || fullPath.startsWith('//')) continue;
        if (hasBinaryExtension(fullPath)) {
          return {
            result: false,
            message: `This tool cannot read binary files: ${r.file_path}.`,
            errorCode: 2,
          };
        }
        if (isBlockedDevicePath(fullPath)) {
          return {
            result: false,
            message: `Cannot read device file: ${r.file_path}.`,
            errorCode: 3,
          };
        }
      }
    }

    if (input.writes) {
      for (const w of input.writes) {
        const fullPath = expandPath(w.file_path);
        if (fullPath.startsWith('\\\\') || fullPath.startsWith('//')) continue;
        if (isBlockedDevicePath(fullPath)) {
          return {
            result: false,
            message: `Cannot write to device file: ${w.file_path}.`,
            errorCode: 4,
          };
        }
      }
    }

    if (input.edits) {
      for (const e of input.edits) {
        const fullPath = expandPath(e.file_path);
        if (fullPath.startsWith('\\\\') || fullPath.startsWith('//')) continue;
        if (isBlockedDevicePath(fullPath)) {
          return {
            result: false,
            message: `Cannot edit device file: ${e.file_path}.`,
            errorCode: 5,
          };
        }
      }
    }

    if (input.searches) {
      for (const s of input.searches) {
        if (s.path) {
          const absolutePath = expandPath(s.path);
          if (absolutePath.startsWith('\\\\') || absolutePath.startsWith('//')) {
            continue;
          }
          try {
            await getFsImplementation().stat(absolutePath);
          } catch (e: any) {
            return {
              result: false,
              message: `Search path does not exist: ${s.path}`,
              errorCode: 6,
            };
          }
        }
      }
    }

    return { result: true };
  },

  async checkPermissions(input: Input, context: ToolUseContext) {
    const appState = context.getAppState();
    let worstResult: PermissionResult = { behavior: 'allow', updatedInput: input };

    if (input.reads) {
      for (const r of input.reads) {
        const fullPath = expandPath(r.file_path);
        const decision = checkReadPermissionForTool(
          ParallelSearchReadTool,
          { file_path: fullPath },
          appState.toolPermissionContext,
        );
        if (decision.behavior === 'deny') return decision;
        if (decision.behavior === 'ask') worstResult = decision;
      }
    }

    if (input.searches) {
      for (const s of input.searches) {
        const fullPath = s.path ? expandPath(s.path) : getCwd();
        const decision = checkReadPermissionForTool(
          ParallelSearchReadTool,
          { path: fullPath },
          appState.toolPermissionContext,
        );
        if (decision.behavior === 'deny') return decision;
        if (decision.behavior === 'ask') worstResult = decision;
      }
    }

    if (input.writes) {
      for (const w of input.writes) {
        const fullPath = expandPath(w.file_path);
        const decision = checkWritePermissionForTool(
          FileWriteTool,
          { file_path: fullPath, content: '' },
          appState.toolPermissionContext,
        );
        if (decision.behavior === 'deny') return decision;
        if (decision.behavior === 'ask') worstResult = decision;
      }
    }

    if (input.edits) {
      for (const e of input.edits) {
        const fullPath = expandPath(e.file_path);
        const decision = checkWritePermissionForTool(
          FileEditTool,
          { file_path: fullPath, old_string: '', new_string: '' },
          appState.toolPermissionContext,
        );
        if (decision.behavior === 'deny') return decision;
        if (decision.behavior === 'ask') worstResult = decision;
      }
    }

    return worstResult;
  },

  async call(input: Input, context: ToolUseContext, _canUseTool?, parentMessage?) {
    const { readFileState, fileReadingLimits, abortController } = context;
    const defaults = getDefaultFileReadingLimits();
    const maxSizeBytes = fileReadingLimits?.maxSizeBytes ?? defaults.maxSizeBytes;
    const maxTokens = fileReadingLimits?.maxTokens ?? defaults.maxTokens;

    const searchResults: SearchResultItem[] = [];
    const readResults: ReadResultItem[] = [];
    const writeResults: WriteResultItem[] = [];
    const editResults: EditResultItem[] = [];

    // Run parallel searches
    if (input.searches && input.searches.length > 0) {
      const searchTasks: SearchTask[] = input.searches.map(s => ({
        pattern: s.pattern,
        path: s.path,
        glob: s.glob,
        type: s.type,
        output_mode: s.output_mode ?? 'files_with_matches',
        head_limit: s.head_limit,
        offset: s.offset,
        multiline: s.multiline,
        case_insensitive: s.case_insensitive,
      }));

      try {
        const searchRes = await parallelSearch(searchTasks, abortController.signal, getCwd());
        for (const t of searchRes.tasks) {
          searchResults.push({
            pattern: t.task.pattern,
            path: t.task.path,
            output_mode: t.task.output_mode,
            results: t.results,
            success: !t.error,
            error: t.error,
          });
        }
      } catch (err: any) {
        searchResults.push({
          pattern: 'batch_error',
          output_mode: 'files_with_matches',
          results: [],
          success: false,
          error: err.message || String(err),
        });
      }
    }

    // Run parallel reads
    if (input.reads && input.reads.length > 0) {
      const readRes = await pMap(
        input.reads,
        async r => {
          const fullFilePath = expandPath(r.file_path);
          const offset = r.offset ?? 1;
          const limit = r.limit;

          try {
            const lineOffset = offset === 0 ? 0 : offset - 1;
            const { content, lineCount, totalLines, mtimeMs } = await readFileInRange(
              fullFilePath,
              lineOffset,
              limit,
              limit === undefined ? maxSizeBytes : undefined,
              abortController.signal,
            );

            const ext = path.extname(fullFilePath).toLowerCase().slice(1);
            const tokenEstimate = roughTokenCountEstimationForFileType(content, ext);
            if (tokenEstimate && tokenEstimate > maxTokens) {
              const tokenCount = await countTokensWithAPI(content);
              const effectiveCount = tokenCount ?? tokenEstimate;
              if (effectiveCount > maxTokens) {
                throw new Error(
                  `File content (${effectiveCount} tokens) exceeds maximum allowed tokens (${maxTokens}).`,
                );
              }
            }

            readFileState.set(fullFilePath, {
              content,
              timestamp: Math.floor(mtimeMs),
              offset,
              limit,
            });
            context.nestedMemoryAttachmentTriggers?.add(fullFilePath);

            return {
              filePath: r.file_path,
              content,
              numLines: lineCount,
              startLine: offset,
              totalLines,
              success: true,
            };
          } catch (err: any) {
            return {
              filePath: r.file_path,
              content: '',
              numLines: 0,
              startLine: offset,
              totalLines: 0,
              success: false,
              error: err.message || String(err),
            };
          }
        },
        { concurrency: 8 },
      );

      readResults.push(...readRes);
    }

    // Group write/edit tasks by filePath to prevent concurrent operations on the same file.
    const fs = getFsImplementation();
    const opsByFile = new Map<string, Array<{ type: 'write' | 'edit'; task: any }>>();

    if (input.writes) {
      for (const w of input.writes) {
        const fullFilePath = expandPath(w.file_path);
        if (!opsByFile.has(fullFilePath)) opsByFile.set(fullFilePath, []);
        opsByFile.get(fullFilePath)!.push({ type: 'write', task: w });
      }
    }

    if (input.edits) {
      for (const e of input.edits) {
        const fullFilePath = expandPath(e.file_path);
        if (!opsByFile.has(fullFilePath)) opsByFile.set(fullFilePath, []);
        opsByFile.get(fullFilePath)!.push({ type: 'edit', task: e });
      }
    }

    // Process each file's operations sequentially, but different files concurrently
    const filePathsToProcess = Array.from(opsByFile.keys());
    await pMap(
      filePathsToProcess,
      async filePath => {
        const ops = opsByFile.get(filePath)!;
        for (const op of ops) {
          if (op.type === 'write') {
            const w = op.task;
            const fullFilePath = expandPath(w.file_path);
            const dir = path.dirname(fullFilePath);

            try {
              await fs.mkdir(dir);

              let fileExists = false;
              let originalFileContents = '';
              let encoding: BufferEncoding = 'utf8';
              let lineEndings: 'LF' | 'CRLF' = 'LF';

              try {
                const meta = readFileSyncWithMetadata(fullFilePath);
                originalFileContents = meta.content;
                encoding = meta.encoding;
                lineEndings = meta.lineEndings;
                fileExists = true;
              } catch (e: any) {
                if (!isENOENT(e)) throw e;
              }

              writeTextContent(fullFilePath, w.content, encoding, lineEndings);
              clearAllCache();

              readFileState.set(fullFilePath, {
                content: w.content,
                timestamp: getFileModificationTime(fullFilePath),
                offset: undefined,
                limit: undefined,
              });

              writeResults.push({
                filePath: w.file_path,
                success: true,
                type: fileExists ? 'update' : 'create',
              });
            } catch (err: any) {
              writeResults.push({
                filePath: w.file_path,
                success: false,
                error: err.message || String(err),
                type: 'create',
              });
            }
          } else {
            // Edit operation
            const e = op.task;
            const fullFilePath = expandPath(e.file_path);
            const dir = path.dirname(fullFilePath);

            try {
              await fs.mkdir(dir);

              let originalFileContents = '';
              let fileExists = false;
              let encoding: BufferEncoding = 'utf8';
              let lineEndings: 'LF' | 'CRLF' = 'LF';

              try {
                const meta = readFileSyncWithMetadata(fullFilePath);
                originalFileContents = meta.content;
                encoding = meta.encoding;
                lineEndings = meta.lineEndings;
                fileExists = true;
              } catch (err: any) {
                if (!isENOENT(err)) throw err;
              }

              if (!fileExists && e.old_string !== '') {
                throw new Error('File does not exist and old_string is not empty.');
              }

              const actualOldString = findActualString(originalFileContents, e.old_string) || e.old_string;
              const actualNewString = preserveQuoteStyle(e.old_string, actualOldString, e.new_string);

              const { updatedFile } = getPatchForEdit({
                filePath: fullFilePath,
                fileContents: originalFileContents,
                oldString: actualOldString,
                newString: actualNewString,
                replaceAll: e.replace_all ?? false,
              });

              writeTextContent(fullFilePath, updatedFile, encoding, lineEndings);
              clearAllCache();

              readFileState.set(fullFilePath, {
                content: updatedFile,
                timestamp: getFileModificationTime(fullFilePath),
                offset: undefined,
                limit: undefined,
              });

              editResults.push({
                filePath: e.file_path,
                success: true,
              });
            } catch (err: any) {
              editResults.push({
                filePath: e.file_path,
                success: false,
                error: err.message || String(err),
              });
            }
          }
        }
      },
      { concurrency: 8 },
    );

    return {
      data: {
        searches: searchResults,
        reads: readResults,
        writes: writeResults,
        edits: editResults,
      },
    };
  },

  mapToolResultToToolResultBlockParam(data: Output, toolUseID: string) {
    const sections: string[] = [];

    if (data.searches && data.searches.length > 0) {
      sections.push('=== SEARCHES ===');
      data.searches.forEach((s, idx) => {
        sections.push(`Search Task ${idx + 1}:`);
        sections.push(`- Pattern: "${s.pattern}"`);
        if (s.path) sections.push(`- Path: "${s.path}"`);
        sections.push(`- Output Mode: "${s.output_mode}"`);

        if (!s.success) {
          sections.push(`- Status: Error - ${s.error}`);
        } else if (s.results.length === 0) {
          sections.push('- Results: No matches found');
        } else {
          sections.push(`- Results (${s.results.length} found):`);
          const formattedResults = s.results.map(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const filePath = line.substring(0, colonIndex);
              const rest = line.substring(colonIndex);
              return toRelativePath(filePath) + rest;
            }
            return toRelativePath(line);
          });
          sections.push(formattedResults.join('\n'));
        }
        sections.push('');
      });
    }

    if (data.reads && data.reads.length > 0) {
      sections.push('=== FILE READS ===');
      data.reads.forEach((r, idx) => {
        sections.push(`Read Task ${idx + 1}:`);
        sections.push(`- File: "${r.filePath}"`);

        if (!r.success) {
          sections.push(`- Status: Error - ${r.error}`);
        } else {
          const endLine = r.numLines > 0 ? r.startLine + r.numLines - 1 : r.startLine;
          sections.push(`- Lines ${r.startLine}-${endLine} of ${r.totalLines}:`);
          if (r.content) {
            sections.push(addLineNumbers({ content: r.content, startLine: r.startLine }));
          } else {
            sections.push('<empty file>');
          }
        }
        sections.push('');
      });
    }

    if (data.writes && data.writes.length > 0) {
      sections.push('=== FILE WRITES ===');
      data.writes.forEach((w, idx) => {
        sections.push(`Write Task ${idx + 1}:`);
        sections.push(`- File: "${w.filePath}"`);
        if (!w.success) {
          sections.push(`- Status: Error - ${w.error}`);
        } else {
          sections.push(`- Status: Success (${w.type === 'create' ? 'Created' : 'Updated'})`);
        }
        sections.push('');
      });
    }

    if (data.edits && data.edits.length > 0) {
      sections.push('=== FILE EDITS ===');
      data.edits.forEach((e, idx) => {
        sections.push(`Edit Task ${idx + 1}:`);
        sections.push(`- File: "${e.filePath}"`);
        if (!e.success) {
          sections.push(`- Status: Error - ${e.error}`);
        } else {
          sections.push('- Status: Success (String replaced)');
        }
        sections.push('');
      });
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: sections.join('\n'),
    };
  },

  renderToolUseMessage(input: Partial<Input>) {
    const numSearches = input.searches?.length ?? 0;
    const numReads = input.reads?.length ?? 0;
    const numWrites = input.writes?.length ?? 0;
    const numEdits = input.edits?.length ?? 0;
    return `ParallelSearchRead: ${numSearches} searches, ${numReads} reads, ${numWrites} writes, ${numEdits} edits`;
  },

  renderToolResultMessage(data: Output, _progressMessages: any[], options: { verbose: boolean }) {
    const { verbose } = options;
    const numSearches = data.searches?.length ?? 0;
    const numReads = data.reads?.length ?? 0;
    const numWrites = data.writes?.length ?? 0;
    const numEdits = data.edits?.length ?? 0;

    const successfulSearches = data.searches?.filter(s => s.success).length ?? 0;
    const successfulReads = data.reads?.filter(r => r.success).length ?? 0;
    const successfulWrites = data.writes?.filter(w => w.success).length ?? 0;
    const successfulEdits = data.edits?.filter(e => e.success).length ?? 0;

    if (verbose) {
      return (
        <Box flexDirection="column" marginY={1}>
          <Text bold color="suggestion">
            Parallel File Operations Summary:
          </Text>
          <Text>
            {' '}
            Searches: {successfulSearches}/{numSearches} successful
          </Text>
          {data.searches?.map((s, i) => (
            <Text key={`s-${i}`} dimColor={!s.success}>
              {s.success ? '    ✓' : '    ✗'} Search {i + 1} ("{s.pattern}"): {s.results.length} results{' '}
              {s.error ? `(${s.error})` : ''}
            </Text>
          ))}
          <Text>
            {' '}
            Reads: {successfulReads}/{numReads} successful
          </Text>
          {data.reads?.map((r, i) => (
            <Text key={`r-${i}`} dimColor={!r.success}>
              {r.success ? '    ✓' : '    ✗'} Read {i + 1} ({r.filePath}): {r.numLines} lines read{' '}
              {r.error ? `(${r.error})` : ''}
            </Text>
          ))}
          <Text>
            {' '}
            Writes: {successfulWrites}/{numWrites} successful
          </Text>
          {data.writes?.map((w, i) => (
            <Text key={`w-${i}`} dimColor={!w.success}>
              {w.success ? '    ✓' : '    ✗'} Write {i + 1} ({w.filePath}): {w.error ? `(${w.error})` : 'Success'}
            </Text>
          ))}
          <Text>
            {' '}
            Edits: {successfulEdits}/{numEdits} successful
          </Text>
          {data.edits?.map((e, i) => (
            <Text key={`e-${i}`} dimColor={!e.success}>
              {e.success ? '    ✓' : '    ✗'} Edit {i + 1} ({e.filePath}): {e.error ? `(${e.error})` : 'Success'}
            </Text>
          ))}
        </Box>
      );
    }

    return (
      <MessageResponse>
        <Text color="success">
          Completed {numSearches} searches, {numReads} reads, {numWrites} writes, and {numEdits} edits concurrently in
          parallel.
        </Text>
      </MessageResponse>
    );
  },
} satisfies ToolDef<InputSchema, Output>);
