import { open } from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type {
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  CallHierarchyIncomingCall,
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  CallHierarchyItem,
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  CallHierarchyOutgoingCall,
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  DocumentSymbol,
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  Hover,
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  Location,
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  LocationLink,
  // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
  SymbolInformation,
} from 'vscode-languageserver-types';
import { z } from 'zod/v4';
import {
  getInitializationStatus,
  getLspServerManager,
  isLspConnected,
  waitForInitialization,
} from '../../services/lsp/manager.js';
import type { ValidationResult } from '../../Tool.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { logForDebugging } from '../../utils/debug.js';
import { isENOENT, toError } from '../../utils/errors.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { logError } from '../../utils/log.js';
import { expandPath } from '../../utils/path.js';
import { checkReadPermissionForTool } from '../../utils/permissions/filesystem.js';
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js';
import { runExplore } from './explore.js';
import {
  formatDocumentSymbolResult,
  formatFindReferencesResult,
  formatGoToDefinitionResult,
  formatHoverResult,
  formatIncomingCallsResult,
  formatOutgoingCallsResult,
  formatPrepareCallHierarchyResult,
  formatWorkspaceSymbolResult,
} from './formatters.js';
import { filterGitIgnoredLocations, toLocation } from './locations.js';
import { DESCRIPTION, LSP_TOOL_NAME } from './prompt.js';
import { lspToolInputSchema } from './schemas.js';
import { renderToolResultMessage, renderToolUseErrorMessage, renderToolUseMessage, userFacingName } from './UI.js';

const MAX_LSP_FILE_SIZE_BYTES = 10_000_000;
const SYMBOL_CACHE_TTL_MS = 60_000;

type SymbolCacheEntry = {
  output: Output;
  timestamp: number;
};

const symbolCache = new Map<string, SymbolCacheEntry>();

function getSymbolCacheKey(input: Input, absolutePath: string, cwd: string): string | null {
  if (input.operation === 'workspaceSymbol') {
    return JSON.stringify({ operation: input.operation, cwd });
  }
  if (input.operation !== 'documentSymbol') {
    return null;
  }

  try {
    const mtimeMs = getFsImplementation().statSync(absolutePath).mtimeMs;
    return JSON.stringify({ operation: input.operation, absolutePath, mtimeMs });
  } catch {
    return null;
  }
}

function getCachedSymbolOutput(key: string | null): Output | null {
  if (!key) return null;

  const entry = symbolCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > SYMBOL_CACHE_TTL_MS) {
    symbolCache.delete(key);
    return null;
  }

  return entry.output;
}

function setCachedSymbolOutput(key: string | null, output: Output): void {
  if (!key) return;
  symbolCache.set(key, {
    output,
    timestamp: Date.now(),
  });
}

/**
 * Tool-compatible input schema (regular ZodObject instead of discriminated union)
 * We validate against the discriminated union in validateInput for better error messages
 */
const inputSchema = lazySchema(() =>
  z.strictObject({
    operation: z
      .enum([
        'explore',
        'goToDefinition',
        'findReferences',
        'hover',
        'documentSymbol',
        'workspaceSymbol',
        'goToImplementation',
        'prepareCallHierarchy',
        'incomingCalls',
        'outgoingCalls',
      ])
      .describe('The LSP operation to perform'),
    // Position fields are optional here and enforced per-operation by the
    // discriminated union in validateInput — `explore` is query-based and has no
    // position to point at, while every other operation still requires all three.
    filePath: z
      .string()
      .optional()
      .describe('The absolute or relative path to the file (all operations except explore)'),
    line: z.number().int().positive().optional().describe('The line number (1-based, as shown in editors)'),
    character: z.number().int().positive().optional().describe('The character offset (1-based, as shown in editors)'),
    query: z.string().optional().describe('Symbol names or a question (explore only)'),
  }),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    operation: z
      .enum([
        'explore',
        'goToDefinition',
        'findReferences',
        'hover',
        'documentSymbol',
        'workspaceSymbol',
        'goToImplementation',
        'prepareCallHierarchy',
        'incomingCalls',
        'outgoingCalls',
      ])
      .describe('The LSP operation that was performed'),
    result: z.string().describe('The formatted result of the LSP operation'),
    filePath: z.string().describe('The file path the operation was performed on'),
    resultCount: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Number of results (definitions, references, symbols)'),
    fileCount: z.number().int().nonnegative().optional().describe('Number of files containing results'),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;

export type Output = z.infer<OutputSchema>;
export type Input = z.infer<InputSchema>;

/**
 * An input for any operation other than `explore`. Those all carry a position,
 * which validateInput enforces via the discriminated union before `call` runs.
 * Excluding `explore` from the operation union also keeps the switch in
 * getMethodAndParams exhaustive.
 */
type PositionalInput = Omit<Input, 'operation'> & {
  operation: Exclude<Input['operation'], 'explore'>;
  filePath: string;
  line: number;
  character: number;
};

export const LSPTool = buildTool({
  name: LSP_TOOL_NAME,
  searchHint: 'code intelligence (definitions, references, symbols, hover)',
  maxResultSizeChars: 100_000,
  isLsp: true,
  async description() {
    return DESCRIPTION;
  },
  userFacingName,
  shouldDefer: true,
  isEnabled() {
    return isLspConnected();
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  getPath({ filePath }): string {
    // `explore` has no single target file — it reads across the project, so the
    // permission check is scoped to the working directory.
    return filePath === undefined ? getCwd() : expandPath(filePath);
  },
  async validateInput(input: Input): Promise<ValidationResult> {
    // First validate against the discriminated union for better type safety
    const parseResult = lspToolInputSchema().safeParse(input);
    if (!parseResult.success) {
      return {
        result: false,
        message: `Invalid input: ${parseResult.error.message}`,
        errorCode: 3,
      };
    }

    // `explore` searches the workspace rather than a named file — the
    // discriminated union above already guaranteed it carries a query.
    if (input.operation === 'explore') {
      return { result: true };
    }

    // Validate file exists and is a regular file
    const fs = getFsImplementation();
    const absolutePath = expandPath(input.filePath ?? '');

    // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
    if (absolutePath.startsWith('\\\\') || absolutePath.startsWith('//')) {
      return { result: true };
    }

    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch (error) {
      if (isENOENT(error)) {
        return {
          result: false,
          message: `File does not exist: ${input.filePath}`,
          errorCode: 1,
        };
      }
      const err = toError(error);
      // Log filesystem access errors for tracking
      logError(new Error(`Failed to access file stats for LSP operation on ${input.filePath}: ${err.message}`));
      return {
        result: false,
        message: `Cannot access file: ${input.filePath}. ${err.message}`,
        errorCode: 4,
      };
    }

    if (!stats.isFile()) {
      return {
        result: false,
        message: `Path is not a file: ${input.filePath}`,
        errorCode: 2,
      };
    }

    return { result: true };
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState();
    // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
    return checkReadPermissionForTool(LSPTool, input, appState.toolPermissionContext);
  },
  async prompt() {
    return DESCRIPTION;
  },
  renderToolUseMessage,
  renderToolUseErrorMessage,
  renderToolResultMessage,
  async call(input: Input, _context) {
    const cwd = getCwd();

    // `explore` is workspace-scoped and never cached — always-fresh results are
    // the reason it exists instead of an on-disk index.
    if (input.operation === 'explore') {
      const status = getInitializationStatus();
      if (status.status === 'pending') {
        await waitForInitialization();
      }
      const exploreManager = getLspServerManager();
      if (!exploreManager) {
        logError(new Error('LSP server manager not initialized when explore was called'));
        return {
          data: {
            operation: input.operation,
            result: 'LSP server manager not initialized. This may indicate a startup issue.',
            filePath: cwd,
          } satisfies Output,
        };
      }

      try {
        const { formatted, resultCount, fileCount } = await runExplore(input.query ?? '', cwd, exploreManager);

        return {
          data: {
            operation: input.operation,
            result: formatted,
            filePath: cwd,
            resultCount,
            fileCount,
          } satisfies Output,
        };
      } catch (error) {
        const message = toError(error).message;
        logError(new Error(`LSP explore failed for query "${input.query}": ${message}`));
        return {
          data: {
            operation: input.operation,
            result: `Error performing explore: ${message}`,
            filePath: cwd,
          } satisfies Output,
        };
      }
    }

    // Every remaining operation is position-based; validateInput has already
    // enforced that filePath/line/character are present for them.
    const positional = input as PositionalInput;
    const filePath = positional.filePath;
    const absolutePath = expandPath(filePath);
    const symbolCacheKey = getSymbolCacheKey(input, absolutePath, cwd);
    const cachedSymbolOutput = getCachedSymbolOutput(symbolCacheKey);
    if (cachedSymbolOutput) {
      return { data: cachedSymbolOutput };
    }

    // Wait for initialization if it's still pending
    // This prevents returning "no server available" before init completes
    const status = getInitializationStatus();
    if (status.status === 'pending') {
      await waitForInitialization();
    }

    // Get the LSP server manager
    const manager = getLspServerManager();
    if (!manager) {
      // Log this system-level failure for tracking
      logError(new Error('LSP server manager not initialized when tool was called'));

      const output: Output = {
        operation: input.operation,
        result: 'LSP server manager not initialized. This may indicate a startup issue.',
        filePath,
      };
      return {
        data: output,
      };
    }

    // Map operation to LSP method and prepare params
    const { method, params } = getMethodAndParams(positional, absolutePath);

    try {
      // Ensure file is open in LSP server before making requests
      // Most LSP servers require textDocument/didOpen before operations
      // Only read the file if it's not already open to avoid unnecessary I/O
      if (!manager.isFileOpen(absolutePath)) {
        const handle = await open(absolutePath, 'r');
        try {
          const stats = await handle.stat();
          if (stats.size > MAX_LSP_FILE_SIZE_BYTES) {
            const output: Output = {
              operation: input.operation,
              result: `File too large for LSP analysis (${Math.ceil(stats.size / 1_000_000)}MB exceeds 10MB limit)`,
              filePath,
            };
            return { data: output };
          }
          const fileContent = await handle.readFile({ encoding: 'utf-8' });
          await manager.openFile(absolutePath, fileContent);
        } finally {
          await handle.close();
        }
      }

      // Send request to LSP server
      let result = await manager.sendRequest(absolutePath, method, params);

      if (result === undefined) {
        // Log for diagnostic purposes - helps track usage patterns and potential bugs
        logForDebugging(
          `No LSP server available for file type ${path.extname(absolutePath)} for operation ${input.operation} on file ${input.filePath}`,
        );

        const output: Output = {
          operation: input.operation,
          result: `No LSP server available for file type: ${path.extname(absolutePath)}`,
          filePath,
        };
        return {
          data: output,
        };
      }

      // For incomingCalls and outgoingCalls, we need a two-step process:
      // 1. First get CallHierarchyItem(s) from prepareCallHierarchy
      // 2. Then request the actual calls using that item
      if (input.operation === 'incomingCalls' || input.operation === 'outgoingCalls') {
        const callItems = result as CallHierarchyItem[];
        if (!callItems || callItems.length === 0) {
          const output: Output = {
            operation: input.operation,
            result: 'No call hierarchy item found at this position',
            filePath,
            resultCount: 0,
            fileCount: 0,
          };
          return { data: output };
        }

        // Use the first call hierarchy item to request calls
        const callMethod =
          input.operation === 'incomingCalls' ? 'callHierarchy/incomingCalls' : 'callHierarchy/outgoingCalls';

        result = await manager.sendRequest(absolutePath, callMethod, {
          item: callItems[0],
        });

        if (result === undefined) {
          logForDebugging(`LSP server returned undefined for ${callMethod} on ${input.filePath}`);
          // Continue to formatter which will handle empty/null gracefully
        }
      }

      // Filter out gitignored files from location-based results
      if (
        result &&
        Array.isArray(result) &&
        (input.operation === 'findReferences' ||
          input.operation === 'goToDefinition' ||
          input.operation === 'goToImplementation' ||
          input.operation === 'workspaceSymbol')
      ) {
        if (input.operation === 'workspaceSymbol') {
          // SymbolInformation has location.uri — filter by extracting locations
          const symbols = result as SymbolInformation[];
          const locations = symbols.filter(s => s?.location?.uri).map(s => s.location);
          const filteredLocations = await filterGitIgnoredLocations(locations, cwd);
          const filteredUris = new Set(filteredLocations.map(l => l.uri));
          result = symbols.filter(s => !s?.location?.uri || filteredUris.has(s.location.uri));
        } else {
          // Location[] or (Location | LocationLink)[]
          const locations = (result as (Location | LocationLink)[]).map(toLocation);
          const filteredLocations = await filterGitIgnoredLocations(locations, cwd);
          const filteredUris = new Set(filteredLocations.map(l => l.uri));
          result = (result as (Location | LocationLink)[]).filter(item => {
            const loc = toLocation(item);
            return !loc.uri || filteredUris.has(loc.uri);
          });
        }
      }

      // Format the result based on operation type
      const { formatted, resultCount, fileCount } = formatResult(input.operation, result, cwd);

      const output: Output = {
        operation: input.operation,
        result: formatted,
        filePath,
        resultCount,
        fileCount,
      };
      setCachedSymbolOutput(symbolCacheKey, output);

      return {
        data: output,
      };
    } catch (error) {
      const err = toError(error);
      const errorMessage = err.message;

      // Log error for tracking
      logError(new Error(`LSP tool request failed for ${input.operation} on ${input.filePath}: ${errorMessage}`));

      const output: Output = {
        operation: input.operation,
        result: `Error performing ${input.operation}: ${errorMessage}`,
        filePath,
      };
      return {
        data: output,
      };
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.result,
    };
  },
} satisfies ToolDef<InputSchema, Output>);

/**
 * Maps LSPTool operation to LSP method and params
 */
function getMethodAndParams(input: PositionalInput, absolutePath: string): { method: string; params: unknown } {
  const uri = pathToFileURL(absolutePath).href;
  // Convert from 1-based (user-friendly) to 0-based (LSP protocol)
  const position = {
    line: input.line - 1,
    character: input.character - 1,
  };

  switch (input.operation) {
    case 'goToDefinition':
      return {
        method: 'textDocument/definition',
        params: {
          textDocument: { uri },
          position,
        },
      };
    case 'findReferences':
      return {
        method: 'textDocument/references',
        params: {
          textDocument: { uri },
          position,
          context: { includeDeclaration: true },
        },
      };
    case 'hover':
      return {
        method: 'textDocument/hover',
        params: {
          textDocument: { uri },
          position,
        },
      };
    case 'documentSymbol':
      return {
        method: 'textDocument/documentSymbol',
        params: {
          textDocument: { uri },
        },
      };
    case 'workspaceSymbol':
      return {
        method: 'workspace/symbol',
        params: {
          query: '', // Empty query returns all symbols
        },
      };
    case 'goToImplementation':
      return {
        method: 'textDocument/implementation',
        params: {
          textDocument: { uri },
          position,
        },
      };
    case 'prepareCallHierarchy':
      return {
        method: 'textDocument/prepareCallHierarchy',
        params: {
          textDocument: { uri },
          position,
        },
      };
    case 'incomingCalls':
      // For incoming/outgoing calls, we first need to prepare the call hierarchy
      // The LSP server will return CallHierarchyItem(s) that we pass to the calls request
      return {
        method: 'textDocument/prepareCallHierarchy',
        params: {
          textDocument: { uri },
          position,
        },
      };
    case 'outgoingCalls':
      return {
        method: 'textDocument/prepareCallHierarchy',
        params: {
          textDocument: { uri },
          position,
        },
      };
  }
}

/**
 * Counts the total number of symbols including nested children
 */
function countSymbols(symbols: DocumentSymbol[]): number {
  let count = symbols.length;
  for (const symbol of symbols) {
    if (symbol.children && symbol.children.length > 0) {
      count += countSymbols(symbol.children);
    }
  }
  return count;
}

/**
 * Counts unique files from an array of locations
 */
function countUniqueFiles(locations: Location[]): number {
  return new Set(locations.map(loc => loc.uri)).size;
}

/**
 * Formats LSP result based on operation type and extracts summary counts
 */
function formatResult(
  operation: PositionalInput['operation'],
  result: unknown,
  cwd: string,
): { formatted: string; resultCount: number; fileCount: number } {
  switch (operation) {
    case 'goToDefinition': {
      // Handle both Location and LocationLink formats
      const rawResults = Array.isArray(result) ? result : result ? [result as Location | LocationLink] : [];

      // Convert LocationLinks to Locations for uniform handling
      const locations = rawResults.map(toLocation);

      // Log and filter out locations with undefined uris
      const invalidLocations = locations.filter(loc => !loc?.uri);
      if (invalidLocations.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidLocations.length} location(s) with undefined URI for goToDefinition on ${cwd}. ` +
              `This indicates malformed data from the LSP server.`,
          ),
        );
      }

      const validLocations = locations.filter(loc => loc?.uri);
      return {
        formatted: formatGoToDefinitionResult(
          result as Location | Location[] | LocationLink | LocationLink[] | null,
          cwd,
        ),
        resultCount: validLocations.length,
        fileCount: countUniqueFiles(validLocations),
      };
    }
    case 'findReferences': {
      const locations = (result as Location[]) || [];

      // Log and filter out locations with undefined uris
      const invalidLocations = locations.filter(loc => !loc?.uri);
      if (invalidLocations.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidLocations.length} location(s) with undefined URI for findReferences on ${cwd}. ` +
              `This indicates malformed data from the LSP server.`,
          ),
        );
      }

      const validLocations = locations.filter(loc => loc?.uri);
      return {
        formatted: formatFindReferencesResult(result as Location[] | null, cwd),
        resultCount: validLocations.length,
        fileCount: countUniqueFiles(validLocations),
      };
    }
    case 'hover': {
      return {
        formatted: formatHoverResult(result as Hover | null, cwd),
        resultCount: result ? 1 : 0,
        fileCount: result ? 1 : 0,
      };
    }
    case 'documentSymbol': {
      // LSP allows documentSymbol to return either DocumentSymbol[] or SymbolInformation[]
      const symbols = (result as (DocumentSymbol | SymbolInformation)[]) || [];
      // Detect format: DocumentSymbol has 'range', SymbolInformation has 'location'
      const isDocumentSymbol = symbols.length > 0 && symbols[0] && 'range' in symbols[0];
      // Count symbols - DocumentSymbol can have nested children, SymbolInformation is flat
      const count = isDocumentSymbol ? countSymbols(symbols as DocumentSymbol[]) : symbols.length;
      return {
        formatted: formatDocumentSymbolResult(result as (DocumentSymbol[] | SymbolInformation[]) | null, cwd),
        resultCount: count,
        fileCount: symbols.length > 0 ? 1 : 0,
      };
    }
    case 'workspaceSymbol': {
      const symbols = (result as SymbolInformation[]) || [];

      // Log and filter out symbols with undefined location.uri
      const invalidSymbols = symbols.filter(sym => !sym?.location?.uri);
      if (invalidSymbols.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidSymbols.length} symbol(s) with undefined location URI for workspaceSymbol on ${cwd}. ` +
              `This indicates malformed data from the LSP server.`,
          ),
        );
      }

      const validSymbols = symbols.filter(sym => sym?.location?.uri);
      const locations = validSymbols.map(s => s.location);
      return {
        formatted: formatWorkspaceSymbolResult(result as SymbolInformation[] | null, cwd),
        resultCount: validSymbols.length,
        fileCount: countUniqueFiles(locations),
      };
    }
    case 'goToImplementation': {
      // Handle both Location and LocationLink formats (same as goToDefinition)
      const rawResults = Array.isArray(result) ? result : result ? [result as Location | LocationLink] : [];

      // Convert LocationLinks to Locations for uniform handling
      const locations = rawResults.map(toLocation);

      // Log and filter out locations with undefined uris
      const invalidLocations = locations.filter(loc => !loc?.uri);
      if (invalidLocations.length > 0) {
        logError(
          new Error(
            `LSP server returned ${invalidLocations.length} location(s) with undefined URI for goToImplementation on ${cwd}. ` +
              `This indicates malformed data from the LSP server.`,
          ),
        );
      }

      const validLocations = locations.filter(loc => loc?.uri);
      return {
        // Reuse goToDefinition formatter since the result format is identical
        formatted: formatGoToDefinitionResult(
          result as Location | Location[] | LocationLink | LocationLink[] | null,
          cwd,
        ),
        resultCount: validLocations.length,
        fileCount: countUniqueFiles(validLocations),
      };
    }
    case 'prepareCallHierarchy': {
      const items = (result as CallHierarchyItem[]) || [];
      return {
        formatted: formatPrepareCallHierarchyResult(result as CallHierarchyItem[] | null, cwd),
        resultCount: items.length,
        fileCount: items.length > 0 ? countUniqueFilesFromCallItems(items) : 0,
      };
    }
    case 'incomingCalls': {
      const calls = (result as CallHierarchyIncomingCall[]) || [];
      return {
        formatted: formatIncomingCallsResult(result as CallHierarchyIncomingCall[] | null, cwd),
        resultCount: calls.length,
        fileCount: calls.length > 0 ? countUniqueFilesFromIncomingCalls(calls) : 0,
      };
    }
    case 'outgoingCalls': {
      const calls = (result as CallHierarchyOutgoingCall[]) || [];
      return {
        formatted: formatOutgoingCallsResult(result as CallHierarchyOutgoingCall[] | null, cwd),
        resultCount: calls.length,
        fileCount: calls.length > 0 ? countUniqueFilesFromOutgoingCalls(calls) : 0,
      };
    }
  }
}

/**
 * Counts unique files from CallHierarchyItem array
 * Filters out items with undefined URIs
 */
function countUniqueFilesFromCallItems(items: CallHierarchyItem[]): number {
  const validUris = items.map(item => item.uri).filter(uri => uri);
  return new Set(validUris).size;
}

/**
 * Counts unique files from CallHierarchyIncomingCall array
 * Filters out calls with undefined URIs
 */
function countUniqueFilesFromIncomingCalls(calls: CallHierarchyIncomingCall[]): number {
  const validUris = calls.map(call => call.from?.uri).filter(uri => uri);
  return new Set(validUris).size;
}

/**
 * Counts unique files from CallHierarchyOutgoingCall array
 * Filters out calls with undefined URIs
 */
function countUniqueFilesFromOutgoingCalls(calls: CallHierarchyOutgoingCall[]): number {
  const validUris = calls.map(call => call.to?.uri).filter(uri => uri);
  return new Set(validUris).size;
}
