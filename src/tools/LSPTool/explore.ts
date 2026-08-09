/**
 * `explore` — one call that answers "what is X, and what breaks if I change it".
 *
 * This is an aggregation over the LSP primitives the tool already exposes, and
 * deliberately *not* an index: workspace/symbol finds the candidates, the file
 * on disk supplies verbatim source, and callHierarchy/incomingCalls supplies the
 * blast radius. Nothing is persisted, so there is no staleness window and no
 * database to keep on disk — the tradeoff is LSP round-trips instead of a
 * SQLite lookup, which is the right trade at this repo's size.
 *
 * The output intentionally mirrors FileReadTool's `<n>\t<line>` shape so the
 * source it returns can be handed straight to FileEditTool.
 */
import { readFile, stat } from 'fs/promises';
import { isAbsolute, relative } from 'path';
import { pathToFileURL } from 'url';
import type {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  Range,
  SymbolInformation,
} from 'vscode-languageserver-types';
import type { LSPServerManager } from '../../services/lsp/LSPServerManager.js';
import { logForDebugging } from '../../utils/debug.js';
import { errorMessage } from '../../utils/errors.js';
import { formatUri, symbolKindToString } from './formatters.js';
import { filterGitIgnoredLocations, uriToFilePath } from './locations.js';

/** Terms pulled from the query and fanned out to workspace/symbol. */
const MAX_TERMS = 4;
/** Symbols expanded with source + callers. Bounds both latency and output size. */
const MAX_SYMBOLS = 6;
/** Hard ceiling on source lines shown per symbol. */
const MAX_LINES_PER_SYMBOL = 120;
/**
 * Floor on source lines shown per symbol. Some servers report a name-only range
 * for workspace/symbol results, which would otherwise render a single line with
 * no body — show a window instead so the caller sees what the symbol does.
 */
const MIN_LINES_PER_SYMBOL = 25;
const MAX_CALLERS_SHOWN = 8;
const MAX_LINE_CHARS = 500;
const MAX_FILE_BYTES = 2_000_000;

/**
 * Words that never name a symbol. Keeps a natural-language question from
 * fanning out into useless workspace/symbol queries.
 */
const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'her',
  'was',
  'one',
  'our',
  'out',
  'how',
  'does',
  'did',
  'what',
  'where',
  'when',
  'why',
  'who',
  'which',
  'this',
  'that',
  'these',
  'those',
  'with',
  'from',
  'into',
  'about',
  'work',
  'works',
  'used',
  'use',
  'uses',
  'using',
  'get',
  'gets',
  'set',
  'sets',
  'add',
  'new',
  'code',
  'file',
  'files',
  'function',
  'functions',
  'class',
  'classes',
  'method',
  'methods',
  'show',
  'find',
  'explain',
  'happens',
  'happen',
  'called',
  'calls',
  'call',
  'change',
  'changes',
  'break',
  'breaks',
  'implemented',
  'implement',
  'handle',
  'handles',
  'here',
  'there',
  'have',
  'has',
  'had',
  'its',
  'it',
  'is',
  'in',
  'on',
  'of',
  'to',
  'a',
  'an',
  'again',
  'then',
  'than',
  'also',
  'just',
  'only',
  'more',
  'most',
  'some',
  'any',
  'each',
  'both',
  'other',
  'same',
  'such',
  'very',
  'much',
  'many',
  'across',
  'between',
  'before',
  'after',
  'why',
]);

/** SymbolKinds worth surfacing first — the things you actually call or extend. */
const PREFERRED_KINDS = new Set([
  5 /* Class */, 6 /* Method */, 10 /* Enum */, 11 /* Interface */, 12 /* Function */, 23 /* Struct */,
]);
const SECONDARY_KINDS = new Set([9 /* Constructor */, 14 /* Constant */, 2 /* Module */, 3 /* Namespace */]);

export type ExploreResult = {
  formatted: string;
  resultCount: number;
  fileCount: number;
};

/**
 * Splits a query into candidate symbol names.
 *
 * Accepts both a bag of names ("PeerServer setActiveMode") and a question
 * ("how does setActiveMode persist?"). Identifier-shaped tokens (camelCase,
 * PascalCase, snake_case) rank above bare lowercase words, because those are
 * far more likely to be real symbols than prose.
 */
export function extractTerms(query: string): string[] {
  const tokens = query.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
  const scored = new Map<string, number>();

  for (const token of tokens) {
    if (token.length < 3) continue;
    if (STOPWORDS.has(token.toLowerCase())) continue;

    // Identifier-shaped: has an internal capital, an underscore, or starts uppercase.
    const looksLikeIdentifier = /[a-z][A-Z]/.test(token) || token.includes('_') || /^[A-Z]/.test(token);
    const score = (looksLikeIdentifier ? 10 : 1) + Math.min(token.length, 20) / 20;

    const existing = scored.get(token);
    if (existing === undefined || score > existing) {
      scored.set(token, score);
    }
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TERMS)
    .map(([term]) => term);
}

/** Stable identity for a symbol occurrence, used to merge results across terms and servers. */
function symbolKey(symbol: SymbolInformation): string {
  return `${symbol.location.uri}:${symbol.location.range.start.line}:${symbol.location.range.start.character}:${symbol.name}`;
}

/**
 * Fans workspace/symbol out to every healthy server and merges the results.
 *
 * Going through the server instances rather than manager.sendRequest(filePath)
 * means explore needs no anchor file and covers every language in a polyglot
 * repo in one pass.
 */
async function collectSymbols(manager: LSPServerManager, terms: string[]): Promise<SymbolInformation[]> {
  const servers = [...manager.getAllServers().values()].filter(server => server.isHealthy());
  if (servers.length === 0) return [];

  const requests: Promise<SymbolInformation[]>[] = [];
  for (const server of servers) {
    for (const term of terms) {
      requests.push(
        server
          .sendRequest<SymbolInformation[] | null>('workspace/symbol', { query: term })
          .then(result => result ?? [])
          .catch(error => {
            // A server that does not implement workspace/symbol is normal, not a failure.
            logForDebugging(`explore: workspace/symbol failed on ${server.name} for "${term}": ${errorMessage(error)}`);
            return [];
          }),
      );
    }
  }

  const merged = new Map<string, SymbolInformation>();
  for (const batch of await Promise.all(requests)) {
    for (const symbol of batch) {
      if (!symbol?.location?.uri || !symbol.location.range) continue;
      merged.set(symbolKey(symbol), symbol);
    }
  }
  return [...merged.values()];
}

/**
 * Ranks symbols by how likely they are to be what the caller meant, then caps
 * the list. Exact name matches dominate; kind is the tiebreaker.
 */
function rankSymbols(symbols: SymbolInformation[], terms: string[]): SymbolInformation[] {
  const lowerTerms = terms.map(t => t.toLowerCase());

  function score(symbol: SymbolInformation): number {
    const name = symbol.name;
    const lower = name.toLowerCase();
    let value = 0;

    if (terms.includes(name)) {
      value += 100;
    } else if (lowerTerms.includes(lower)) {
      value += 50;
    } else if (lowerTerms.some(t => lower.startsWith(t))) {
      value += 20;
    } else if (lowerTerms.some(t => lower.includes(t))) {
      value += 5;
    }

    if (PREFERRED_KINDS.has(symbol.kind)) value += 15;
    else if (SECONDARY_KINDS.has(symbol.kind)) value += 5;

    // Prefer the definition over a re-export barrel.
    if (/\/index\.[jt]sx?$/.test(symbol.location.uri)) value -= 5;

    return value;
  }

  return symbols
    .map(symbol => ({ symbol, value: score(symbol) }))
    .sort((a, b) => b.value - a.value || a.symbol.name.localeCompare(b.symbol.name))
    .slice(0, MAX_SYMBOLS)
    .map(entry => entry.symbol);
}

/** True when `filePath` lives inside `cwd` — external dependencies are noise here. */
function isInsideCwd(filePath: string, cwd: string): boolean {
  const rel = relative(cwd, filePath);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Points at the symbol's *name* rather than the start of its declaration.
 *
 * prepareCallHierarchy resolves nothing when aimed at an `export` keyword, which
 * is where a declaration range commonly starts.
 */
function locateName(lines: string[], range: Range, name: string): { line: number; character: number } {
  const lastLine = Math.min(range.end.line, range.start.line + 5, lines.length - 1);
  for (let line = range.start.line; line <= lastLine; line++) {
    const index = lines[line]?.indexOf(name) ?? -1;
    if (index >= 0) {
      return { line, character: index };
    }
  }
  return { line: range.start.line, character: range.start.character };
}

/** Renders a source slice in FileReadTool's `<n>\t<line>` form (1-based). */
function renderSource(lines: string[], range: Range): string {
  const start = Math.max(0, range.start.line);
  const spanned = Math.max(1, range.end.line - range.start.line + 1);
  // Trust a range that plausibly covers a declaration. Only pad when the server
  // reported a name-only range, where the alternative is showing a bare
  // signature — padding a real range instead spills into unrelated symbols.
  const take =
    spanned <= 2 ? Math.min(MAX_LINES_PER_SYMBOL, MIN_LINES_PER_SYMBOL) : Math.min(MAX_LINES_PER_SYMBOL, spanned);
  const end = Math.min(lines.length, start + take);

  const rendered: string[] = [];
  for (let line = start; line < end; line++) {
    const text = lines[line] ?? '';
    const clipped = text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS)}…` : text;
    rendered.push(`${line + 1}\t${clipped}`);
  }
  if (end < start + spanned) {
    rendered.push(`… (${start + spanned - end} more lines)`);
  }
  return rendered.join('\n');
}

/**
 * Resolves who calls this symbol. Returns null when the server has no call
 * hierarchy for the position, which is different from "nothing calls it".
 */
async function findCallers(
  manager: LSPServerManager,
  absolutePath: string,
  position: { line: number; character: number },
): Promise<CallHierarchyIncomingCall[] | null> {
  try {
    const items = await manager.sendRequest<CallHierarchyItem[] | null>(
      absolutePath,
      'textDocument/prepareCallHierarchy',
      { textDocument: { uri: pathToFileURL(absolutePath).href }, position },
    );
    if (!items || items.length === 0) return null;

    const calls = await manager.sendRequest<CallHierarchyIncomingCall[] | null>(
      absolutePath,
      'callHierarchy/incomingCalls',
      { item: items[0] },
    );
    return calls ?? [];
  } catch (error) {
    logForDebugging(`explore: call hierarchy failed for ${absolutePath}: ${errorMessage(error)}`);
    return null;
  }
}

/** Reads a file's lines, or null when it is missing or too large to be useful. */
async function readLines(absolutePath: string): Promise<string[] | null> {
  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile() || stats.size > MAX_FILE_BYTES) return null;
    const content = await readFile(absolutePath, 'utf-8');
    return content.split(/\r?\n/);
  } catch (error) {
    logForDebugging(`explore: could not read ${absolutePath}: ${errorMessage(error)}`);
    return null;
  }
}

/**
 * Runs the explore aggregation and formats it as a single bundle grouped by file.
 */
export async function runExplore(query: string, cwd: string, manager: LSPServerManager): Promise<ExploreResult> {
  const terms = extractTerms(query);
  if (terms.length === 0) {
    return {
      formatted: `No searchable symbol names in query "${query}". Pass symbol names (e.g. "setActiveMode PeerServer") or a question that mentions them.`,
      resultCount: 0,
      fileCount: 0,
    };
  }

  const found = await collectSymbols(manager, terms);
  if (found.length === 0) {
    return {
      formatted:
        `No symbols found for: ${terms.join(', ')}\n\n` +
        `No LSP server reported a matching symbol. If the symbol is not code (a string, a config key, a comment), use Grep instead.`,
      resultCount: 0,
      fileCount: 0,
    };
  }

  // Same visibility rules as the single-shot operations: no gitignored files,
  // and nothing outside the project (node_modules, global type packages).
  const visible = (
    await filterGitIgnoredLocations(
      found.map(s => s.location),
      cwd,
    )
  ).map(l => l.uri);
  const visibleUris = new Set(visible);
  const inScope = found.filter(
    symbol => visibleUris.has(symbol.location.uri) && isInsideCwd(uriToFilePath(symbol.location.uri), cwd),
  );

  if (inScope.length === 0) {
    return {
      formatted:
        `Found ${found.length} symbol(s) for ${terms.join(', ')}, but all of them are outside the project ` +
        `(dependencies or gitignored files). Nothing in this repo defines them.`,
      resultCount: 0,
      fileCount: 0,
    };
  }

  const ranked = rankSymbols(inScope, terms);

  // Group by file so the caller reads one coherent section per file.
  const sections = new Map<string, string[]>();
  const filesTouched = new Set<string>();
  let callerTotal = 0;

  for (const symbol of ranked) {
    const absolutePath = uriToFilePath(symbol.location.uri);
    const lines = await readLines(absolutePath);
    if (!lines) continue;

    filesTouched.add(absolutePath);
    const range = symbol.location.range;
    const namePosition = locateName(lines, range, symbol.name);

    const header =
      `### ${symbolKindToString(symbol.kind)} ${symbol.name}` +
      `${symbol.containerName ? ` (in ${symbol.containerName})` : ''} — line ${range.start.line + 1}`;

    const body = renderSource(lines, range);

    const calls = await findCallers(manager, absolutePath, namePosition);
    let blastRadius: string;
    if (calls === null) {
      blastRadius = 'Callers: not available (no call hierarchy at this position)';
    } else if (calls.length === 0) {
      blastRadius = 'Callers: none found — nothing in the project calls this';
    } else {
      callerTotal += calls.length;
      const callerFiles = new Set(calls.map(call => call.from?.uri).filter(Boolean));
      const shown = calls
        .slice(0, MAX_CALLERS_SHOWN)
        .map(call => `${call.from?.name ?? '<unknown>'} (${formatUri(call.from?.uri, cwd)})`);
      const overflow = calls.length > MAX_CALLERS_SHOWN ? `, +${calls.length - MAX_CALLERS_SHOWN} more` : '';
      blastRadius = `Callers (${calls.length} in ${callerFiles.size} file(s)): ${shown.join(', ')}${overflow}`;
    }

    const relPath = formatUri(symbol.location.uri, cwd);
    const existing = sections.get(relPath) ?? [];
    existing.push(`${header}\n${body}\n${blastRadius}`);
    sections.set(relPath, existing);
  }

  if (sections.size === 0) {
    return {
      formatted: `Found ${ranked.length} symbol(s) for ${terms.join(', ')}, but none of their files could be read.`,
      resultCount: 0,
      fileCount: 0,
    };
  }

  const parts: string[] = [
    `Explored "${query}" — matched on: ${terms.join(', ')}`,
    `${ranked.length} symbol(s) across ${sections.size} file(s); ${callerTotal} caller(s) total.`,
    '',
  ];
  for (const [file, entries] of sections) {
    parts.push(`## ${file}`, '', ...entries.map(entry => `${entry}\n`));
  }
  if (inScope.length > ranked.length) {
    parts.push(
      `(${inScope.length - ranked.length} lower-ranked match(es) not expanded — narrow the query to see them.)`,
    );
  }

  return {
    formatted: parts.join('\n'),
    resultCount: ranked.length,
    fileCount: sections.size,
  };
}
