#!/usr/bin/env node
/**
 * Static import-graph cycle detector for Clew Code src/.
 *
 * Default mode is a regression ratchet: existing debt is allowed up to
 * `.circular-deps-baseline`, but any increase fails CI/local verification.
 * Use --strict to fail on any cycle and --all to print every cycle.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC_ROOT = resolve(ROOT, 'src');
const BASELINE_PATH = resolve(ROOT, '.circular-deps-baseline');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const printAll = args.has('--all');
const maxPrinted = printAll ? Number.POSITIVE_INFINITY : 20;

function getAllSourceFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '.git') continue;
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
  if (!importPath.startsWith('.')) return null;

  const currentDir = dirname(currentFilePath);
  let resolvedBase = resolve(currentDir, importPath);
  if (resolvedBase.endsWith('.js') || resolvedBase.endsWith('.jsx')) {
    resolvedBase = resolvedBase.replace(/\.jsx?$/, '');
  }

  for (const ext of EXTENSIONS) {
    const candidate = `${resolvedBase}${ext}`;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }

  for (const ext of EXTENSIONS) {
    const candidate = join(resolvedBase, `index${ext}`);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }

  return null;
}

function extractImports(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const imports = new Set();
  const runtimeImportRegex = /import\s+(?!type\b)(?:[\w*\s{},]*\s+from\s+)?['"](\.[^'"]+)['"]/g;
  const runtimeExportRegex = /export\s+(?!type\b)(?:[\w*\s{},]*\s+from\s+)['"](\.[^'"]+)['"]/g;

  for (const regex of [runtimeImportRegex, runtimeExportRegex]) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const resolved = resolveImport(match[1], filePath);
      if (resolved && resolved !== filePath) imports.add(resolved);
    }
  }

  return Array.from(imports);
}

function buildGraph(files) {
  const graph = new Map();
  for (const file of files) graph.set(file, extractImports(file));
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

    for (const neighbor of graph.get(node) || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        const cycleStartIndex = path.indexOf(neighbor);
        cycles.push(path.slice(cycleStartIndex).concat(neighbor));
      }
    }

    path.pop();
    recStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  const raw = readFileSync(BASELINE_PATH, 'utf8').trim();
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid circular dependency baseline: ${raw || '(empty)'}`);
  }
  return value;
}

function relativeCycle(cycle) {
  return cycle.map(file => file.replace(SRC_ROOT, 'src').replace(/\\/g, '/'));
}

function main() {
  const files = getAllSourceFiles(SRC_ROOT);
  const cycles = findCycles(buildGraph(files));
  const baseline = readBaseline();

  if (cycles.length === 0) {
    console.log(`✓ No circular dependencies found across ${files.length} source files.`);
    return;
  }

  console.log(`Found ${cycles.length} circular dependency cycle(s) across ${files.length} source files.`);
  if (baseline !== null) console.log(`Baseline: ${baseline}.`);

  const shown = cycles.slice(0, maxPrinted);
  for (const [index, cycle] of shown.entries()) {
    console.log(`\nCycle ${index + 1}:`);
    console.log(`  ${relativeCycle(cycle).join('\n  -> ')}`);
  }
  if (!printAll && cycles.length > shown.length) {
    console.log(`\n… ${cycles.length - shown.length} more cycle(s) hidden; rerun with --all to print them.`);
  }

  if (strict) {
    console.error(`\n✗ Strict mode failed: ${cycles.length} circular dependency cycle(s) remain.`);
    process.exitCode = 1;
    return;
  }

  if (baseline === null) {
    console.error('\n✗ Missing .circular-deps-baseline; add a reviewed baseline before using ratchet mode.');
    process.exitCode = 1;
    return;
  }

  if (cycles.length > baseline) {
    console.error(`\n✗ Circular dependency regression: ${cycles.length} exceeds baseline ${baseline}.`);
    process.exitCode = 1;
    return;
  }

  const delta = baseline - cycles.length;
  console.log(`\n✓ Circular dependency ratchet passed (${cycles.length}/${baseline}${delta > 0 ? `, improved by ${delta}` : ''}).`);
}

main();
