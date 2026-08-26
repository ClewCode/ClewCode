#!/usr/bin/env node
/**
 * Fast static import graph cycle detector for Clew Code src/
 * Scans TypeScript / JavaScript files for circular imports.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const SRC_ROOT = resolve(process.cwd(), 'src');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function getAllSourceFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '.git') {
        continue;
      }
      results.push(...getAllSourceFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (
        EXTENSIONS.includes(ext) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.test.tsx') &&
        !entry.name.endsWith('.d.ts')
      ) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function resolveImport(importPath, currentFilePath) {
  if (!importPath.startsWith('.')) return null; // Ignore external/node packages

  const currentDir = dirname(currentFilePath);
  let resolvedBase = resolve(currentDir, importPath);

  // If path ends with .js, strip it to check corresponding .ts / .tsx
  if (resolvedBase.endsWith('.js') || resolvedBase.endsWith('.jsx')) {
    resolvedBase = resolvedBase.replace(/\.jsx?$/, '');
  }

  for (const ext of EXTENSIONS) {
    const candidate = `${resolvedBase}${ext}`;
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {}
  }

  // Check directory index
  for (const ext of EXTENSIONS) {
    const candidate = join(resolvedBase, `index${ext}`);
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {}
  }

  return null;
}

function extractImports(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const importRegex = /(?:import|export)\s+(?:[\w*\s{},]*\s+from\s+)?['"](\.[^'"]+)['"]/g;
  const imports = new Set();

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const resolved = resolveImport(match[1], filePath);
    if (resolved && resolved !== filePath) {
      imports.add(resolved);
    }
  }

  return Array.from(imports);
}

function buildGraph(files) {
  const graph = new Map();
  for (const file of files) {
    graph.set(file, extractImports(file));
  }
  return graph;
}

function findCycles(graph) {
  const visited = new Set();
  const recStack = new Set();
  const path = [];
  const cycles = [];

  function dfs(node) {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        const cycleStartIndex = path.indexOf(neighbor);
        const cycle = path.slice(cycleStartIndex).concat(neighbor);
        cycles.push(cycle);
      }
    }

    path.pop();
    recStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

function main() {
  const files = getAllSourceFiles(SRC_ROOT);
  const graph = buildGraph(files);
  const cycles = findCycles(graph);

  if (cycles.length === 0) {
    console.log(`✓ No circular dependencies found across ${files.length} source files.`);
    process.exit(0);
  } else {
    console.log(`Found ${cycles.length} circular dependency cycle(s):`);
    for (const [index, cycle] of cycles.entries()) {
      const relCycle = cycle.map(f => f.replace(SRC_ROOT, 'src').replace(/\\/g, '/'));
      console.log(`\nCycle ${index + 1}:`);
      console.log(`  ${relCycle.join('\n  -> ')}`);
    }
    // Informative report - return 0 for soft warning or 1 for hard block
    process.exit(0);
  }
}

main();
