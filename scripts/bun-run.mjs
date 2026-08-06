/**
 * Bun runner — injects MACRO global via Bun's --define and runs main.tsx.
 *
 * Uses `--define MACRO:JSON_OBJECT` syntax where the value is parsed as JSON.
 * This replaces bare `MACRO` identifier in all modules at transpile time,
 * making MACRO.VERSION etc. work in dev mode without post-build injection.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

const extraArgs = process.argv.slice(2);
const isWatch = extraArgs[0] === '--watch';
if (isWatch) extraArgs.shift();

const macroJson = JSON.stringify({
  VERSION: pkg.version,
  PACKAGE_URL: 'clew-code',
  FEEDBACK_CHANNEL: 'https://github.com/ClewCode/ClewCode/issues',
  ISSUES_EXPLAINER: 'visit https://github.com/ClewCode/ClewCode/issues',
});

// NOTE: bun:bundle feature() is enabled with `--feature NAME`, not
// `--define.NAME=true` — a --define of the same name is silently ignored and
// the feature stays off.
// Keep this list in sync with the --feature flags in package.json's build
// script, so dev and production agree on which features exist.
//
// TRANSCRIPT_CLASSIFIER is deliberately absent: it require()s prompt assets
// under src/utils/permissions/yolo-classifier-prompts/ that this repo does not
// ship, and the bundler resolves those requires at build time regardless of the
// runtime USER_TYPE check — so enabling it fails the build outright.
const FEATURES = ['CHICAGO_MCP', 'VOICE_MODE', 'AWAY_SUMMARY', 'EXTRACT_MEMORIES'];

const args = ['run', '--define', `MACRO:${macroJson}`, ...FEATURES.flatMap((f) => ['--feature', f])];
if (isWatch) args.push('--watch');
args.push(join(root, 'src/main.tsx'), ...extraArgs);

const child = spawn('bun', args, { stdio: 'inherit', cwd: root });
child.on('exit', (code) => process.exit(code ?? 1));
