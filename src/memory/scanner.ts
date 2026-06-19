/**
 * Memory Scanner — bootstrap project knowledge from repo structure.
 *
 * Reads the current repository and creates initial seed memories:
 * - Project name, stack, framework, language
 * - Package manager, build/test/lint/dev commands
 * - Entrypoints, source layout, key files
 * - Architecture overview (provider system, CLI commands, etc.)
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { getCwd } from '../utils/cwd.js';
import { MemoryDB } from './database.js';
import { writeMemoryFile } from './hierarchy.js';

export type ScanResult = {
  projectName: string;
  packageManager: string;
  language: string;
  runtime: string;
  framework: string;
  entrypoints: string[];
  buildCommands: string[];
  testCommands: string[];
  lintCommands: string[];
  devCommands: string[];
  hasSrcDir: boolean;
  hasProviderSystem: boolean;
  hasCliEntrypoint: boolean;
  created: number;
  updated: number;
  unchanged: number;
  warnings: string[];
};

const PACKAGE_MANAGER_INDICATORS = [
  { lock: 'pnpm-lock.yaml', name: 'pnpm' },
  { lock: 'bun.lock', name: 'bun' },
  { lock: 'bun.lockb', name: 'bun' },
  { lock: 'yarn.lock', name: 'yarn' },
  { lock: 'package-lock.json', name: 'npm' },
] as const;

const CONFIG_INDICATORS = [
  { file: 'tsconfig.json', label: 'TypeScript' },
  { file: 'biome.json', label: 'Biome' },
  { file: '.eslintrc.js', label: 'ESLint' },
  { file: '.eslintrc.json', label: 'ESLint' },
  { file: '.prettierrc', label: 'Prettier' },
  { file: '.prettierrc.json', label: 'Prettier' },
  { file: 'vitest.config.ts', label: 'Vitest' },
  { file: 'vitest.config.js', label: 'Vitest' },
  { file: 'jest.config.ts', label: 'Jest' },
  { file: 'jest.config.js', label: 'Jest' },
  { file: '.github/workflows/ci.yml', label: 'CI (GitHub Actions)' },
  { file: '.github/workflows/ci.yaml', label: 'CI (GitHub Actions)' },
  { file: 'Dockerfile', label: 'Docker' },
] as const;

const KEY_FILES = ['CHANGELOG.md', 'README.md', 'LICENSE.md', 'CONTRIBUTING.md', 'AGENTS.md', 'SECURITY.md'];

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(path, 'utf8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function detectLanguage(pkg: Record<string, unknown> | null): string {
  if (!pkg) {
    // Fallback: scan for file extensions
    return 'unknown';
  }
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
  if (
    deps?.typescript ||
    (pkg.scripts &&
      typeof pkg.scripts === 'object' &&
      Object.keys(pkg.scripts as Record<string, string>).some(s => s.includes('tsc')))
  ) {
    return 'TypeScript';
  }
  if (deps?.['@babel/core'] || deps?.eslint) return 'JavaScript';
  return 'JavaScript';
}

function detectFramework(deps: Record<string, string> | undefined): string {
  if (!deps) return 'none';
  if (deps.next) return 'Next.js';
  if (deps.react) return 'React';
  if (deps.vue) return 'Vue';
  if (deps.express) return 'Express';
  if (deps.koa) return 'Koa';
  if (deps.electron) return 'Electron';
  if (deps['ink']) return 'Ink (Terminal UI)';
  return 'none';
}

function detectRuntime(pkg: Record<string, unknown> | null): string {
  const engines = pkg?.engines as Record<string, string> | undefined;
  if (engines?.bun) return 'Bun';
  if (engines?.node) return `Node.js${engines.node ? ` (${engines.node})` : ''}`;
  // Check devDependencies for runtime hints
  const deps = {
    ...(pkg?.dependencies as Record<string, string> | undefined),
    ...(pkg?.devDependencies as Record<string, string> | undefined),
  } as Record<string, string> | undefined;
  if (deps?.bun) return 'Bun';
  return 'Node.js';
}

/**
 * Scan the repository and create seed memories.
 */
export async function scanRepo(): Promise<ScanResult> {
  const cwd = getCwd();
  const warnings: string[] = [];
  const result: ScanResult = {
    projectName: basename(cwd),
    packageManager: 'unknown',
    language: 'unknown',
    runtime: 'Node.js',
    framework: 'none',
    entrypoints: [],
    buildCommands: [],
    testCommands: [],
    lintCommands: [],
    devCommands: [],
    hasSrcDir: false,
    hasProviderSystem: false,
    hasCliEntrypoint: false,
    seedsCreated: 0,
    warnings: [],
  };

  // ── 1. Read package.json ──────────────────────────────
  const pkg = await readJson(join(cwd, 'package.json'));
  if (pkg) {
    result.projectName = (pkg.name as string) ?? basename(cwd);

    // Scripts
    const scripts = (pkg.scripts as Record<string, string>) ?? {};
    for (const [name, cmd] of Object.entries(scripts)) {
      if (/^build/.test(name)) result.buildCommands.push(`${name}: ${cmd}`);
      else if (/^test/.test(name)) result.testCommands.push(`${name}: ${cmd}`);
      else if (/^lint/.test(name)) result.lintCommands.push(`${name}: ${cmd}`);
      else if (/^dev|^start/.test(name)) result.devCommands.push(`${name}: ${cmd}`);
    }

    // Dependencies
    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    } as Record<string, string> | undefined;

    result.language = detectLanguage(pkg);
    result.framework = detectFramework(deps);
    result.runtime = detectRuntime(pkg);

    // Detect provider system
    if (deps) {
      const providerKeywords = ['anthropic', 'openai', 'google-ai', 'cohere', 'mistral', 'provider', 'model'];
      result.hasProviderSystem = providerKeywords.some(k => Object.keys(deps).some(d => d.toLowerCase().includes(k)));
    }
  } else {
    warnings.push('No package.json found');
    result.language = 'unknown';
  }

  // ── 2. Detect package manager ─────────────────────────
  for (const indicator of PACKAGE_MANAGER_INDICATORS) {
    if (existsSync(join(cwd, indicator.lock))) {
      result.packageManager = indicator.name;
      break;
    }
  }

  // ── 3. Detect structure ────────────────────────────────
  result.hasSrcDir = existsSync(join(cwd, 'src'));

  // Entrypoints
  const possibleEntrypoints = [
    'src/main.tsx',
    'src/main.ts',
    'src/index.ts',
    'src/index.tsx',
    'src/index.js',
    'src/app.tsx',
    'src/app.ts',
    'src/cli.ts',
    'src/cli.tsx',
    'main.tsx',
    'main.ts',
    'index.ts',
    'index.tsx',
    'index.js',
  ];
  for (const ep of possibleEntrypoints) {
    if (existsSync(join(cwd, ep))) {
      result.entrypoints.push(ep);
    }
  }
  result.hasCliEntrypoint = result.entrypoints.some(e => e.includes('cli') || e.includes('main'));

  // CLI detection from package.json bin field
  if (pkg?.bin) {
    result.hasCliEntrypoint = true;
  }

  // ── 4. Build memories (idempotent via deterministic keys) ──
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  if (MemoryDB.isInitialized()) {
    const db = MemoryDB.getInstance();
    const seed = (key: string, type: MemoryType, content: string, importance: number, confidence: number) => {
      const res = db.upsertMemory({ key: `scan.${key}`, projectPath: cwd, type, content, importance, confidence });
      if (res.action === 'created') created++;
      else if (res.action === 'updated') updated++;
      else unchanged++;
    };

    // Project overview
    seed(
      'project_overview',
      'architecture',
      `${result.projectName} is a ${result.language} project using ${result.runtime}. Package manager: ${result.packageManager}.${result.framework !== 'none' ? ` UI framework: ${result.framework}.` : ''}`,
      0.9,
      0.8,
    );

    // Stack summary
    seed(
      'stack_summary',
      'reference',
      `Stack: ${result.language} / ${result.runtime} / ${result.packageManager}${result.framework !== 'none' ? ` / ${result.framework}` : ''}`,
      0.8,
      0.9,
    );

    // CLI entrypoints
    if (result.entrypoints.length > 0) {
      seed('cli_entrypoints', 'architecture', `CLI entrypoints: ${result.entrypoints.join(', ')}`, 0.7, 0.8);
    }

    // Provider architecture
    if (result.hasProviderSystem) {
      seed(
        'provider_architecture',
        'architecture',
        `${result.projectName} has a provider-based architecture with multiple AI model providers. Provider routing is handled through a registry/manager pattern.`,
        0.85,
        0.7,
      );
    }

    // Development commands
    const allCommands = [
      ...result.buildCommands,
      ...result.testCommands,
      ...result.lintCommands,
      ...result.devCommands,
    ];
    if (allCommands.length > 0) {
      seed(
        'development_commands',
        'reference',
        `Development commands:\n${allCommands.map(c => `  - ${c}`).join('\n')}`,
        0.75,
        0.9,
      );
    }
  }

  result.created = created;
  result.updated = updated;
  result.unchanged = unchanged;
  result.warnings = warnings;

  // ── 5. Update file hierarchy ──────────────────────────
  await writeMemoryFile('MEMORY.md', buildMemoryMd(result));
  await writeMemoryFile('DECISIONS.md', buildDecisionsMd(result));
  await writeMemoryFile('TASTE.md', buildTasteMd(result));

  return result;
}

function buildMemoryMd(result: ScanResult): string {
  const lines: string[] = [
    '# Project Memory',
    '',
    `## ${result.projectName}`,
    '',
    'Auto-generated from repo scan.',
    '',
    '## Stack',
    `- Language: ${result.language}`,
    `- Runtime: ${result.runtime}`,
    `- Package Manager: ${result.packageManager}`,
  ];

  if (result.framework !== 'none') {
    lines.push(`- Framework: ${result.framework}`);
  }

  if (result.entrypoints.length > 0) {
    lines.push('', '## Entrypoints', ...result.entrypoints.map(e => `- ${e}`));
  }

  if (result.hasProviderSystem) {
    lines.push('', '## Provider System', '- Multi-provider AI routing');
    lines.push('- Provider-agnostic model selection');
  }

  lines.push('', '## Development', '```');
  for (const cmd of result.buildCommands) lines.push(`# build: ${cmd}`);
  for (const cmd of result.testCommands) lines.push(`# test: ${cmd}`);
  for (const cmd of result.lintCommands) lines.push(`# lint: ${cmd}`);
  for (const cmd of result.devCommands) lines.push(`# dev: ${cmd}`);
  lines.push('```');

  return lines.join('\n');
}

function buildDecisionsMd(result: ScanResult): string {
  return [
    '# Architecture Decisions',
    '',
    'Auto-generated from repo scan.',
    '',
    `- ${new Date().toISOString().slice(0, 10)} — Initial project structure detected`,
    `  - Language: ${result.language}`,
    `  - Runtime: ${result.runtime}`,
    `  - Package manager: ${result.packageManager}`,
    result.hasProviderSystem ? `  - Provider routing architecture` : '',
    result.hasSrcDir ? '  - Source code in src/ directory' : '',
    result.hasCliEntrypoint ? '  - CLI entrypoint detected' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildTasteMd(result: ScanResult): string {
  return [
    '# Coding Style & Preferences',
    '',
    'Auto-detected from repo scan.',
    '',
    '## Language',
    `- ${result.language}`,
    '',
    '## Conventions',
    result.hasSrcDir ? '- Source code in src/ directory' : '',
    '- Follow existing project conventions',
    '',
    '## Quality',
    result.testCommands.length > 0 ? `- Tests: ${result.testCommands[0]}` : '- Tests: not detected',
    result.lintCommands.length > 0 ? `- Lint: ${result.lintCommands[0]}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
