import { z } from 'zod/v4';
import { buildTool, type ToolDef } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PROMPT } from './prompt.js';
import { JSON_PATH_TOOL_NAME } from './toolName.js';

const inputSchema = lazySchema(() =>
  z.strictObject({
    json: z.unknown().describe('JSON data to process (object, array, or string)'),
    action: z
      .enum(['query', 'validate', 'format', 'minify', 'stringify', 'parse'])
      .describe('Action to perform on the JSON data'),
    query: z.string().optional().describe('JSONPath or key path to extract (e.g., "user.name", "items[0].id")'),
    indent: z.enum(['2', '4', 'tab']).optional().describe('Indentation for format action (default: 2)'),
    schema: z.unknown().optional().describe('JSON schema to validate against (for validate action)'),
    required: z.array(z.string()).optional().describe('Required field names to check (for validate action)'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
    result: z.unknown().describe('Result of the operation (queried value, validation status, formatted string, etc.)'),
    error: z.string().optional().describe('Error message if operation failed'),
    matchCount: z.number().optional().describe('Number of matches found for query'),
    isValid: z.boolean().optional().describe('Validation result'),
    validationErrors: z.array(z.string()).optional().describe('List of validation errors if invalid'),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;

export type Output = z.infer<OutputSchema>;

function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

function queryJson(json: unknown, query: string): { result: unknown; matchCount: number } {
  const value = getNestedValue(json, query);

  if (value !== undefined) {
    return { result: value, matchCount: 1 };
  }

  if (query.includes('*')) {
    const results: unknown[] = [];
    const searchInObject = (obj: unknown, searchPath: string) => {
      const parts = searchPath.split('*');
      if (parts.length !== 2) return;

      const prefix = parts[0];
      const suffix = parts[1];

      if (typeof obj === 'object' && obj !== null) {
        for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
          if (key.startsWith(prefix) && (suffix === '' || key.endsWith(suffix))) {
            results.push(val);
          }
          if (typeof val === 'object') {
            searchInObject(val, searchPath);
          }
        }
      }
    };

    searchInObject(json, query);
    return { result: results.length > 0 ? results : undefined, matchCount: results.length };
  }

  return { result: undefined, matchCount: 0 };
}

function validateJson(
  json: unknown,
  options: { required?: string[]; schema?: unknown },
): { isValid: boolean; validationErrors: string[] } {
  const errors: string[] = [];

  if (!json || typeof json !== 'object') {
    return { isValid: false, validationErrors: ['Input is not a valid JSON object'] };
  }

  if (options.required) {
    for (const field of options.required) {
      const value = getNestedValue(json, field);
      if (value === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  return { isValid: errors.length === 0, validationErrors: errors };
}

function formatJson(json: unknown, indent: string): string {
  const indentSize = indent === 'tab' ? '\t' : indent === '4' ? '    ' : '  ';
  return JSON.stringify(json, null, indentSize);
}

function minifyJson(json: unknown): string {
  return JSON.stringify(json);
}

function stringifyJson(json: unknown): string {
  return JSON.stringify(json);
}

function parseJson(jsonStr: string): { result: unknown; error?: string } {
  try {
    return { result: JSON.parse(jsonStr) };
  } catch (e) {
    return { result: undefined, error: (e as Error).message };
  }
}

export const JsonPathTool = buildTool({
  name: JSON_PATH_TOOL_NAME,
  searchHint: 'query validate format minify JSON',
  maxResultSizeChars: 100_000,
  strict: true,
  mapToolResultToToolResultBlockParam(data: any, toolUseID: string) {
    const content = data.success ? JSON.stringify(data.result, null, 2) || 'Success' : `Error: ${data.error}`;
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content,
    };
  },
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return PROMPT;
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  userFacingName() {
    return '';
  },
  shouldDefer: true,
  isEnabled() {
    return true;
  },
  toAutoClassifierInput(input) {
    return `${input.action} ${input.query ?? ''}`;
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input };
  },
  renderToolUseMessage() {
    return null;
  },
  async call({ json, action, query, indent, schema, required }, context) {
    try {
      let parsedJson = json;

      if (typeof json === 'string') {
        try {
          parsedJson = JSON.parse(json);
        } catch {
          return {
            data: {
              success: false,
              result: null,
              error: 'Failed to parse JSON string',
            },
          };
        }
      }

      switch (action) {
        case 'query': {
          if (!query) {
            return {
              data: {
                success: false,
                result: null,
                error: 'Query path is required for query action',
              },
            };
          }
          const { result, matchCount } = queryJson(parsedJson, query);
          return {
            data: {
              success: result !== undefined,
              result,
              matchCount,
            },
          };
        }

        case 'validate': {
          const { isValid, validationErrors } = validateJson(parsedJson, { required, schema });
          return {
            data: {
              success: true,
              result: { isValid, validationErrors },
              isValid,
              validationErrors,
            },
          };
        }

        case 'format': {
          const formatted = formatJson(parsedJson, indent ?? '2');
          return {
            data: {
              success: true,
              result: formatted,
            },
          };
        }

        case 'minify': {
          const minified = minifyJson(parsedJson);
          return {
            data: {
              success: true,
              result: minified,
            },
          };
        }

        case 'stringify': {
          const str = stringifyJson(parsedJson);
          return {
            data: {
              success: true,
              result: str,
            },
          };
        }

        case 'parse': {
          if (typeof json !== 'string') {
            return {
              data: {
                success: false,
                result: null,
                error: 'String input required for parse action',
              },
            };
          }
          const { result, error } = parseJson(json);
          return {
            data: {
              success: !error,
              result,
              error,
            },
          };
        }

        default:
          return {
            data: {
              success: false,
              result: null,
              error: `Unknown action: ${action}`,
            },
          };
      }
    } catch (e) {
      return {
        data: {
          success: false,
          result: null,
          error: (e as Error).message,
        },
      };
    }
  },
} as ToolDef<InputSchema, OutputSchema>);
