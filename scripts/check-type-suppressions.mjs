#!/usr/bin/env node
/**
 * Ratchet the number of @ts-expect-error directives in src/.
 * Existing debt is allowed up to `.ts-expect-error-baseline`; increases fail.
 * Use --strict to fail while any directive remains.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC_ROOT = resolve(ROOT, 'src');
const BASELINE_PATH = resolve(ROOT, '.ts-expect-error-baseline');
const strict = process.argv.includes('--strict');
const EXTENSIONS = new Set(['.ts', '.tsx']);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(fullPath, files);
    } else if (entry.isFile() && EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function countDirectives() {
  let count = 0;
  for (const file of walk(SRC_ROOT)) {
    const content = readFileSync(file, 'utf8');
    count += content.split('@ts-expect-error').length - 1;
  }
  return count;
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  const raw = readFileSync(BASELINE_PATH, 'utf8').trim();
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid @ts-expect-error baseline: ${raw || '(empty)'}`);
  }
  return value;
}

const count = countDirectives();
const baseline = readBaseline();
console.log(`@ts-expect-error directives: ${count}${baseline === null ? '' : ` (baseline ${baseline})`}.`);

if (strict && count > 0) {
  console.error(`✗ Strict mode failed: ${count} @ts-expect-error directive(s) remain.`);
  process.exitCode = 1;
} else if (baseline === null) {
  console.error('✗ Missing .ts-expect-error-baseline; add a reviewed baseline before using ratchet mode.');
  process.exitCode = 1;
} else if (count > baseline) {
  console.error(`✗ Type-suppression regression: ${count} exceeds baseline ${baseline}.`);
  process.exitCode = 1;
} else {
  const delta = baseline - count;
  console.log(`✓ Type-suppression ratchet passed (${count}/${baseline}${delta > 0 ? `, improved by ${delta}` : ''}).`);
}
