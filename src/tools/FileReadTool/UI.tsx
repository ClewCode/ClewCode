import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type * as React from 'react';
import { extractTag } from 'src/utils/messages.js';
import { FallbackToolUseErrorMessage } from '../../components/FallbackToolUseErrorMessage.js';
import { FilePathLink } from '../../components/FilePathLink.js';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Text } from '../../ink.js';
import { FILE_NOT_FOUND_CWD_NOTE, getDisplayPath } from '../../utils/file.js';
import { formatFileSize } from '../../utils/format.js';
import { getPlansDirectory } from '../../utils/plans.js';
import { getTaskOutputDir } from '../../utils/task/diskOutput.js';
import type { Input, Output } from './FileReadTool.js';

// Type guards for discriminating between single and batch read inputs
function isBatchInput(input: Partial<Input>): input is { file_paths: string[]; offset?: number; limit?: number } {
  return 'file_paths' in input && Array.isArray(input.file_paths) && input.file_paths.length > 0;
}

function isSingleInput(
  input: Partial<Input>,
): input is { file_path: string; offset?: number; limit?: number; pages?: string } {
  return 'file_path' in input && typeof input.file_path === 'string' && input.file_path.length > 0;
}

/**
 * Check if a file path is an agent output file and extract the task ID.
 * Agent output files follow the pattern: {projectTempDir}/tasks/{taskId}.output
 */
function getAgentOutputTaskId(filePath: string): string | null {
  const prefix = `${getTaskOutputDir()}/`;
  const suffix = '.output';
  if (filePath.startsWith(prefix) && filePath.endsWith(suffix)) {
    const taskId = filePath.slice(prefix.length, -suffix.length);
    // Validate it looks like a task ID (alphanumeric, reasonable length)
    if (taskId.length > 0 && taskId.length <= 20 && /^[a-zA-Z0-9_-]+$/.test(taskId)) {
      return taskId;
    }
  }
  return null;
}
export function renderToolUseMessage(input: Partial<Input>, { verbose }: { verbose: boolean }): React.ReactNode {
  // Handle batch read (file_paths)
  if (isBatchInput(input)) {
    const { file_paths } = input;
    const fileCount = file_paths.length;
    if (fileCount === 1) {
      const singlePath = verbose ? file_paths[0] : getDisplayPath(file_paths[0]);
      return <FilePathLink filePath={file_paths[0]}>{singlePath}</FilePathLink>;
    }
    return <Text>{fileCount} files</Text>;
  }

  // Handle single file read (file_path)
  if (isSingleInput(input)) {
    const { file_path, offset, limit, pages } = input;

    // For agent output files, return empty string so no parentheses are shown
    // The task ID is displayed separately by AssistantToolUseMessage
    if (getAgentOutputTaskId(file_path)) {
      return '';
    }
    const displayPath = verbose ? file_path : getDisplayPath(file_path);
    if (pages) {
      return (
        <Text>
          <FilePathLink filePath={file_path}>{displayPath}</FilePathLink>
          {` · pages ${pages}`}
        </Text>
      );
    }
    if (verbose && (offset || limit)) {
      const startLine = offset ?? 1;
      const lineRange = limit ? `lines ${startLine}-${startLine + limit - 1}` : `from line ${startLine}`;
      return (
        <Text>
          <FilePathLink filePath={file_path}>{displayPath}</FilePathLink>
          {` · ${lineRange}`}
        </Text>
      );
    }
    return <FilePathLink filePath={file_path}>{displayPath}</FilePathLink>;
  }

  return null;
}
export function renderToolUseTag(input: Partial<Input>): React.ReactNode {
  // Only show tag for single file reads with agent output
  if (isSingleInput(input)) {
    const agentTaskId = getAgentOutputTaskId(input.file_path);
    if (agentTaskId) {
      return <Text dimColor> {agentTaskId}</Text>;
    }
  }
  return null;
}
export function renderToolResultMessage(output: Output): React.ReactNode {
  // TODO: Render recursively
  switch (output.type) {
    case 'image': {
      const { originalSize } = output.file;
      const formattedSize = formatFileSize(originalSize);
      return (
        <MessageResponse height={1}>
          <Text>Read image ({formattedSize})</Text>
        </MessageResponse>
      );
    }
    case 'notebook': {
      const { cells } = output.file;
      if (!cells || cells.length < 1) {
        return <Text color="error">No cells found in notebook</Text>;
      }
      return (
        <MessageResponse height={1}>
          <Text>
            Read <Text bold>{cells.length}</Text> cells
          </Text>
        </MessageResponse>
      );
    }
    case 'pdf': {
      const { originalSize } = output.file;
      const formattedSize = formatFileSize(originalSize);
      return (
        <MessageResponse height={1}>
          <Text>Read PDF ({formattedSize})</Text>
        </MessageResponse>
      );
    }
    case 'parts': {
      return (
        <MessageResponse height={1}>
          <Text>
            Read <Text bold>{output.file.count}</Text> {output.file.count === 1 ? 'page' : 'pages'} (
            {formatFileSize(output.file.originalSize)})
          </Text>
        </MessageResponse>
      );
    }
    case 'text': {
      const { numLines } = output.file;
      return (
        <MessageResponse height={1}>
          <Text>
            Read <Text bold>{numLines}</Text> {numLines === 1 ? 'line' : 'lines'}
          </Text>
        </MessageResponse>
      );
    }
    case 'file_unchanged': {
      return (
        <MessageResponse height={1}>
          <Text dimColor>Unchanged since last read</Text>
        </MessageResponse>
      );
    }
    case 'batch': {
      const { files } = output;
      const successCount = files.filter(f => f.success).length;
      const failCount = files.length - successCount;
      return (
        <MessageResponse height={1}>
          <Text>
            Read <Text bold>{successCount}</Text> {successCount === 1 ? 'file' : 'files'}
            {failCount > 0 && <Text color="error"> ({failCount} failed)</Text>}
          </Text>
        </MessageResponse>
      );
    }
  }
}
export function renderToolUseErrorMessage(
  result: ToolResultBlockParam['content'],
  {
    verbose,
  }: {
    verbose: boolean;
  },
): React.ReactNode {
  if (!verbose && typeof result === 'string') {
    // FileReadTool throws from call() so errors lack <tool_use_error> wrapping —
    // check the raw string directly for the cwd note marker.
    if (result.includes(FILE_NOT_FOUND_CWD_NOTE)) {
      return (
        <MessageResponse>
          <Text color="error">File not found</Text>
        </MessageResponse>
      );
    }
    if (extractTag(result, 'tool_use_error')) {
      return (
        <MessageResponse>
          <Text color="error">Error reading file</Text>
        </MessageResponse>
      );
    }
  }
  return <FallbackToolUseErrorMessage result={result} verbose={verbose} />;
}
export function userFacingName(input: Partial<Input> | undefined): string {
  if (!input) return 'Read';

  // Handle batch read
  if (isBatchInput(input)) {
    if (input.file_paths.length === 1) {
      return 'Read';
    }
    return `Read ${input.file_paths.length} files`;
  }

  // Handle single file read
  if (isSingleInput(input)) {
    if (input.file_path.startsWith(getPlansDirectory())) {
      return 'Reading Plan';
    }
    if (getAgentOutputTaskId(input.file_path)) {
      return 'Read agent output';
    }
  }

  return 'Read';
}
export function getToolUseSummary(input: Partial<Input> | undefined): string | null {
  if (!input) return null;

  // Handle batch read
  if (isBatchInput(input)) {
    if (input.file_paths.length === 1) {
      return getDisplayPath(input.file_paths[0]);
    }
    return `${input.file_paths.length} files`;
  }

  // Handle single file read
  if (isSingleInput(input)) {
    // For agent output files, just show the task ID
    const agentTaskId = getAgentOutputTaskId(input.file_path);
    if (agentTaskId) {
      return agentTaskId;
    }
    return getDisplayPath(input.file_path);
  }

  return null;
}
