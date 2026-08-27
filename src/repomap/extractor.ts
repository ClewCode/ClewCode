/**
 * Multi-language AST symbol and signature extractor for Repo Map.
 * Extracts high-level structural declarations (interfaces, types, classes, exported functions).
 */

import type { SymbolKind, SymbolSignature } from './types.js';

export function extractFileSymbols(content: string, filePath: string): SymbolSignature[] {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const lines = content.split('\n');
  const symbols: SymbolSignature[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
      continue;
    }

    // 1. Go type / func
    if (ext === 'go') {
      if (/^type\s+([A-Za-z0-9_]+)\s+(struct|interface)/.test(trimmed)) {
        const match = trimmed.match(/^type\s+([A-Za-z0-9_]+)\s+(struct|interface)/);
        if (match) {
          symbols.push({
            name: match[1]!,
            kind: match[2] === 'interface' ? 'interface' : 'class',
            signature: trimmed.split('{')[0]!.trim(),
            exported: /^[A-Z]/.test(match[1]!),
            line: i + 1,
          });
          continue;
        }
      }
      if (/^func\s+(\([^)]+\)\s+)?([A-Za-z0-9_]+)/.test(trimmed)) {
        const match = trimmed.match(/^func\s+(\([^)]+\)\s+)?([A-Za-z0-9_]+)/);
        if (match) {
          symbols.push({
            name: match[2]!,
            kind: 'function',
            signature: trimmed.split('{')[0]!.trim(),
            exported: /^[A-Z]/.test(match[2]!),
            line: i + 1,
          });
          continue;
        }
      }
    }

    // 2. Python def / class
    if (ext === 'py') {
      if (/^(async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/.test(trimmed)) {
        const match = trimmed.match(/^(async\s+)?def\s+([A-Za-z0-9_]+)/);
        if (match) {
          symbols.push({
            name: match[2]!,
            kind: 'function',
            signature: trimmed.replace(/:$/, ''),
            exported: !match[2]!.startsWith('_'),
            line: i + 1,
          });
          continue;
        }
      }
      if (/^class\s+([A-Za-z0-9_]+)/.test(trimmed)) {
        const match = trimmed.match(/^class\s+([A-Za-z0-9_]+)/);
        if (match) {
          symbols.push({
            name: match[1]!,
            kind: 'class',
            signature: trimmed.replace(/:$/, ''),
            exported: true,
            line: i + 1,
          });
          continue;
        }
      }
    }

    // 3. TypeScript / JavaScript / Rust Interfaces & Types
    if (/^(export\s+)?interface\s+([A-Za-z0-9_$]+)/.test(trimmed)) {
      const match = trimmed.match(/^(export\s+)?interface\s+([A-Za-z0-9_$]+)/);
      if (match) {
        symbols.push({
          name: match[2]!,
          kind: 'interface',
          signature: trimmed.split('{')[0]!.trim(),
          exported: Boolean(match[1]),
          line: i + 1,
        });
        continue;
      }
    }

    if (/^(export\s+)?type\s+([A-Za-z0-9_$]+)/.test(trimmed)) {
      const match = trimmed.match(/^(export\s+)?type\s+([A-Za-z0-9_$]+)/);
      if (match) {
        symbols.push({
          name: match[2]!,
          kind: 'type',
          signature: trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed,
          exported: Boolean(match[1]),
          line: i + 1,
        });
        continue;
      }
    }

    // 4. Classes & Enums
    if (/^(export\s+)?(abstract\s+)?(class|enum)\s+([A-Za-z0-9_$]+)/.test(trimmed)) {
      const match = trimmed.match(/^(export\s+)?(abstract\s+)?(class|enum)\s+([A-Za-z0-9_$]+)/);
      if (match) {
        symbols.push({
          name: match[4]!,
          kind: match[3] as SymbolKind,
          signature: trimmed.split('{')[0]!.trim(),
          exported: Boolean(match[1]),
          line: i + 1,
        });
        continue;
      }
    }

    // 5. Functions
    if (/^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_$]+)/.test(trimmed)) {
      const match = trimmed.match(/^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_$]+)/);
      if (match) {
        symbols.push({
          name: match[3]!,
          kind: 'function',
          signature: trimmed.split('{')[0]!.trim(),
          exported: Boolean(match[1]),
          line: i + 1,
        });
        continue;
      }
    }

    // 6. Exported Arrow Functions / Consts
    if (/^export\s+(const|let)\s+([A-Za-z0-9_$]+)\s*(:\s*[^=]+)?\s*=\s*(async\s*)?\([^)]*\)\s*=>/.test(trimmed)) {
      const match = trimmed.match(/^export\s+(const|let)\s+([A-Za-z0-9_$]+)/);
      if (match) {
        symbols.push({
          name: match[2]!,
          kind: 'function',
          signature: trimmed.split('=>')[0]!.trim(),
          exported: true,
          line: i + 1,
        });
      }
    }
  }

  return symbols;
}
