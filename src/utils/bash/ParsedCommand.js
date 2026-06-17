import memoize from 'lodash-es/memoize.js';
import { extractOutputRedirections, splitCommandWithOperators } from './commands.js';
import { analyzeCommand } from './treeSitterAnalysis.js';
/**
 * @deprecated Legacy regex/shell-quote path. Only used when tree-sitter is
 * unavailable. The primary gate is parseForSecurity (ast.ts).
 *
 * Regex-based fallback implementation using shell-quote parser.
 * Used when tree-sitter is not available.
 * Exported for testing purposes.
 */
export class RegexParsedCommand_DEPRECATED {
  originalCommand;
  constructor(command) {
    this.originalCommand = command;
  }
  toString() {
    return this.originalCommand;
  }
  getPipeSegments() {
    try {
      const parts = splitCommandWithOperators(this.originalCommand);
      const segments = [];
      let currentSegment = [];
      for (const part of parts) {
        if (part === '|') {
          if (currentSegment.length > 0) {
            segments.push(currentSegment.join(' '));
            currentSegment = [];
          }
        } else {
          currentSegment.push(part);
        }
      }
      if (currentSegment.length > 0) {
        segments.push(currentSegment.join(' '));
      }
      return segments.length > 0 ? segments : [this.originalCommand];
    } catch {
      return [this.originalCommand];
    }
  }
  withoutOutputRedirections() {
    if (!this.originalCommand.includes('>')) {
      return this.originalCommand;
    }
    const { commandWithoutRedirections, redirections } = extractOutputRedirections(this.originalCommand);
    return redirections.length > 0 ? commandWithoutRedirections : this.originalCommand;
  }
  getOutputRedirections() {
    const { redirections } = extractOutputRedirections(this.originalCommand);
    return redirections;
  }
  getTreeSitterAnalysis() {
    return null;
  }
}
function visitNodes(node, visitor) {
  visitor(node);
  for (const child of node.children) {
    visitNodes(child, visitor);
  }
}
function extractPipePositions(rootNode) {
  const pipePositions = [];
  visitNodes(rootNode, node => {
    if (node.type === 'pipeline') {
      for (const child of node.children) {
        if (child.type === '|') {
          pipePositions.push(child.startIndex);
        }
      }
    }
  });
  // visitNodes is depth-first. For `a | b && c | d`, the outer `list` nests
  // the second pipeline as a sibling of the first, so the outer `|` is
  // visited before the inner one — positions arrive out of order.
  // getPipeSegments iterates them to slice left-to-right, so sort here.
  return pipePositions.sort((a, b) => a - b);
}
function extractRedirectionNodes(rootNode) {
  const redirections = [];
  visitNodes(rootNode, node => {
    if (node.type === 'file_redirect') {
      const children = node.children;
      const op = children.find(c => c.type === '>' || c.type === '>>');
      const target = children.find(c => c.type === 'word');
      if (op && target) {
        redirections.push({
          startIndex: node.startIndex,
          endIndex: node.endIndex,
          target: target.text,
          operator: op.type,
        });
      }
    }
  });
  return redirections;
}
class TreeSitterParsedCommand {
  originalCommand;
  // Tree-sitter's startIndex/endIndex are UTF-8 byte offsets, but JS
  // String.slice() uses UTF-16 code-unit indices. For ASCII they coincide;
  // for multi-byte code points (e.g. `—` U+2014: 3 UTF-8 bytes, 1 code unit)
  // they diverge and slicing the string directly lands mid-token. Slicing
  // the UTF-8 Buffer with tree-sitter's byte offsets and decoding back to
  // string is correct regardless of code-point width.
  commandBytes;
  pipePositions;
  redirectionNodes;
  treeSitterAnalysis;
  constructor(command, pipePositions, redirectionNodes, treeSitterAnalysis) {
    this.originalCommand = command;
    this.commandBytes = Buffer.from(command, 'utf8');
    this.pipePositions = pipePositions;
    this.redirectionNodes = redirectionNodes;
    this.treeSitterAnalysis = treeSitterAnalysis;
  }
  toString() {
    return this.originalCommand;
  }
  getPipeSegments() {
    if (this.pipePositions.length === 0) {
      return [this.originalCommand];
    }
    const segments = [];
    let currentStart = 0;
    for (const pipePos of this.pipePositions) {
      const segment = this.commandBytes.subarray(currentStart, pipePos).toString('utf8').trim();
      if (segment) {
        segments.push(segment);
      }
      currentStart = pipePos + 1;
    }
    const lastSegment = this.commandBytes.subarray(currentStart).toString('utf8').trim();
    if (lastSegment) {
      segments.push(lastSegment);
    }
    return segments;
  }
  withoutOutputRedirections() {
    if (this.redirectionNodes.length === 0) return this.originalCommand;
    const sorted = [...this.redirectionNodes].sort((a, b) => b.startIndex - a.startIndex);
    let result = this.commandBytes;
    for (const redir of sorted) {
      result = Buffer.concat([result.subarray(0, redir.startIndex), result.subarray(redir.endIndex)]);
    }
    return result.toString('utf8').trim().replace(/\s+/g, ' ');
  }
  getOutputRedirections() {
    return this.redirectionNodes.map(({ target, operator }) => ({
      target,
      operator,
    }));
  }
  getTreeSitterAnalysis() {
    return this.treeSitterAnalysis;
  }
}
const getTreeSitterAvailable = memoize(async () => {
  try {
    const { parseCommand } = await import('./parser.js');
    const testResult = await parseCommand('echo test');
    return testResult !== null;
  } catch {
    return false;
  }
});
/**
 * Build a TreeSitterParsedCommand from a pre-parsed AST root. Lets callers
 * that already have the tree skip the redundant native.parse that
 * ParsedCommand.parse would do.
 */
export function buildParsedCommandFromRoot(command, root) {
  const pipePositions = extractPipePositions(root);
  const redirectionNodes = extractRedirectionNodes(root);
  const analysis = analyzeCommand(root, command);
  return new TreeSitterParsedCommand(command, pipePositions, redirectionNodes, analysis);
}
async function doParse(command) {
  if (!command) return null;
  const treeSitterAvailable = await getTreeSitterAvailable();
  if (treeSitterAvailable) {
    try {
      const { parseCommand } = await import('./parser.js');
      const data = await parseCommand(command);
      if (data) {
        // Native NAPI parser returns plain JS objects (no WASM handles);
        // nothing to free — extract directly.
        return buildParsedCommandFromRoot(command, data.rootNode);
      }
    } catch {
      // Fall through to regex implementation
    }
  }
  // Fallback to regex implementation
  return new RegexParsedCommand_DEPRECATED(command);
}
// Single-entry cache: legacy callers (bashCommandIsSafeAsync,
// buildSegmentWithoutRedirections) may call ParsedCommand.parse repeatedly
// with the same command string. Each parse() is ~1 native.parse + ~6 tree
// walks, so caching the most recent command skips the redundant work.
// Size-1 bound avoids leaking TreeSitterParsedCommand instances.
let lastCmd;
let lastResult;
/**
 * ParsedCommand provides methods for working with shell commands.
 * Uses tree-sitter when available for quote-aware parsing,
 * falls back to regex-based parsing otherwise.
 */
export const ParsedCommand = {
  /**
   * Parse a command string and return a ParsedCommand instance.
   * Returns null if parsing fails completely.
   */
  parse(command) {
    if (command === lastCmd && lastResult !== undefined) {
      return lastResult;
    }
    lastCmd = command;
    lastResult = doParse(command);
    return lastResult;
  },
};
