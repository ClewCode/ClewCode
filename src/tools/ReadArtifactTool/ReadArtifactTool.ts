// ReadArtifact — read large persisted tool outputs in line-based chunks

import { readFile } from 'fs/promises';
import { isAbsolute, resolve } from 'path';
import { z } from 'zod/v4';
import type { Tool } from '../../Tool.js';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';

export const READ_ARTIFACT_TOOL_NAME = 'ReadArtifact';

const DESCRIPTION = `\
Reads a portion of a persisted tool output file (artifact).

Use this when a tool result was too large and its full output was saved to disk
(shown with a "Full output saved at: <path>" message). You can read the full
output in chunks by specifying offset and limit.

Parameters:
- file_path: Absolute path to the artifact file (shown in the truncation message)
- offset: Line number to start reading from (0-indexed, default: 0)
- limit: Maximum number of lines to read (default: 500, max: 2000)`;

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z.string().describe('Absolute path to the artifact file'),
    offset: z.number().int().min(0).default(0).describe('Line number to start from (0-indexed)'),
    limit: z.number().int().min(1).max(2000).default(500).describe('Maximum lines to read'),
  }),
);

type ReadArtifactInput = z.infer<ReturnType<typeof inputSchema>>;

type ReadArtifactOutput = {
  file_path: string;
  offset: number;
  limit: number;
  total_lines: number;
  lines: string[];
  has_more: boolean;
};

async function call(input: ReadArtifactInput): Promise<{ data: ReadArtifactOutput }> {
  const absPath = isAbsolute(input.file_path) ? input.file_path : resolve(input.file_path);
  const content = await readFile(absPath, 'utf-8');
  const allLines = content.split('\n');

  // Remove trailing empty line from split if content ends with newline
  if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
    allLines.pop();
  }

  const chunk = allLines.slice(input.offset, input.offset + input.limit);

  return {
    data: {
      file_path: absPath,
      offset: input.offset,
      limit: input.limit,
      total_lines: allLines.length,
      lines: chunk,
      has_more: input.offset + input.limit < allLines.length,
    },
  };
}

export const ReadArtifactTool: Tool<ReturnType<typeof inputSchema>, ReadArtifactOutput> = buildTool({
  name: READ_ARTIFACT_TOOL_NAME,
  searchHint: 'read large tool output files in line-based chunks',
  maxResultSizeChars: 100_000,

  userFacingName() {
    return 'ReadArtifact';
  },

  get inputSchema(): ReturnType<typeof inputSchema> {
    return inputSchema();
  },

  isReadOnly() {
    return true;
  },

  isConcurrencySafe() {
    return true;
  },

  async description() {
    return DESCRIPTION;
  },

  async prompt() {
    return DESCRIPTION;
  },

  async call(input) {
    return call(input);
  },

  renderToolUseMessage(input) {
    const path = input.file_path;
    const shortPath = path.split(/[/\\]/).slice(-2).join('/');
    return `read ${input.limit} lines of ${shortPath} from line ${input.offset}`;
  },

  mapToolResultToToolResultBlockParam(result, toolUseID) {
    const { file_path, offset, limit, total_lines, lines, has_more } = result.data;
    let output = lines.join('\n');
    if (has_more) {
      output += `\n... (showing lines ${offset + 1}-${offset + lines.length} of ${total_lines})`;
      output += `\nRead next chunk: ReadArtifact({ file_path: "${file_path}", offset: ${offset + limit}, limit: ${limit} })`;
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: output,
    };
  },
});
