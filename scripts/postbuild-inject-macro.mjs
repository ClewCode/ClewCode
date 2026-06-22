/**
 * Post-build script: injects global `var MACRO` declaration into the bundled
 * output so code that references the bare `MACRO` identifier works at runtime.
 *
 * main.tsx already sets `globalThis.MACRO` from generated/version.json, but
 * bundled modules reference the bare `MACRO` identifier (intended for Bun's
 * --define). Without --define, the identifier is undefined in module scope.
 *
 * This script prepends `var MACRO;` right before the bundle starts so the
 * module scope finds `MACRO` on globalThis via the fallback chain.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const bundlePath = join(root, 'dist', 'main.js');

// Inject MACRO with actual values so bundled modules that reference the bare
// `MACRO` identifier (intended for Bun's --define) work at runtime without
// --define flags.
const preamble = `var MACRO={VERSION:"${pkg.version}",PACKAGE_URL:"clew-code",FEEDBACK_CHANNEL:"https://github.com/ClewCode/ClewCode/issues",ISSUES_EXPLAINER:"visit https://github.com/ClewCode/ClewCode/issues"};\n`;

const original = readFileSync(bundlePath, 'utf-8');

// Only inject if not already present
if (!original.startsWith('var MACRO=') && !original.startsWith('var MACRO;')) {
  writeFileSync(bundlePath, preamble + original, 'utf-8');
  console.log(`[postbuild] Injected var MACRO (version: ${pkg.version})`);
} else {
  console.log('[postbuild] var MACRO already present, skipping');
}
