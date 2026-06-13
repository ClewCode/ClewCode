// Clew taste: AI-driven codebase analysis for taste rule generation

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { extname, join, relative } from 'path';
import type { TasteRuleKind } from '../core/TasteTypes.js';

// ── Analyzer Result ───────────────────────────────────────────────────────────

export type CodebaseAnalysis = {
  rules: Array<{
    text: string;
    kind: TasteRuleKind;
    confidence: number;
    evidence: string;
  }>;
  summary: string;
};

// ── Codebase Analyzer ─────────────────────────────────────────────────────────

export class TasteCodebaseAnalyzer {
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? process.cwd();
  }

  /** Collect codebase context for AI analysis */
  collectContext(): CodebaseContext {
    return {
      gitLog: this.getGitLog(),
      configFiles: this.readConfigFiles(),
      projectFiles: this.sampleProjectFiles(),
      dependencies: this.getDependencies(),
    };
  }

  /** Analyze codebase using AI and return structured rules */
  async analyzeWithAI(context: CodebaseContext): Promise<CodebaseAnalysis> {
    const { sideQuery } = await import('../../../utils/sideQuery.js');
    const { ProviderManager } = await import('../../ai/ProviderManager.js');

    // Get the active provider's small/fast model for cost efficiency
    const pm = ProviderManager.getInstance();
    const model = pm.getModelForProvider() || 'deepseek/deepseek-v4-flash';

    const systemPrompt = `You are a code review expert analyzing a developer's coding preferences.

Given the codebase context below, identify 3-10 concrete coding preferences that this developer follows.
Focus on patterns you can confidently observe from the actual code.

Respond with ONLY a JSON array of rules:
[
  {
    "text": "specific rule description",
    "kind": "style|architecture|testing|naming|security|performance|tooling|ui|workflow",
    "confidence": 0.7-0.95,
    "evidence": "what files/patterns support this"
  }
]

Rules must be:
- Specific and actionable (e.g. "Use 2-space indentation" not "Write clean code")
- Based on observable evidence from the code
- Confidence should reflect how consistently the pattern appears`;

    const userPrompt = [
      '# Git Log (recent commits)',
      context.gitLog.slice(0, 3000),
      '',
      '# Config Files',
      Object.entries(context.configFiles)
        .map(([name, content]) => `--- ${name} ---\n${content}`)
        .join('\n'),
      '',
      '# Project Files (samples)',
      context.projectFiles
        .slice(0, 10)
        .map(f => `--- ${f.path} ---\n${f.content}`)
        .join('\n'),
      '',
      '# Dependencies',
      JSON.stringify(context.dependencies, null, 2),
    ].join('\n');

    try {
      const response = await sideQuery({
        model,
        max_tokens: 2000,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        querySource: 'taste_codebase_analysis',
        messages: [{ role: 'user', content: [{ type: 'text', text: userPrompt }] }],
      });

      const text = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');

      return this.parseResponse(text);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return { rules: [], summary: `AI analysis failed: ${errMsg}. Falling back to heuristic detection.` };
    }
  }

  /** Deterministic fallback when AI analysis is unavailable or returns no rules. */
  analyzeWithHeuristics(context: CodebaseContext): CodebaseAnalysis {
    const rules: CodebaseAnalysis['rules'] = [];
    const configNames = new Set(Object.keys(context.configFiles));
    const deps = context.dependencies;
    const sampleText = context.projectFiles.map(file => file.content).join('\n');

    if (configNames.has('biome.json') || configNames.has('biome.jsonc')) {
      rules.push({
        text: 'Use Biome formatting and lint rules for TypeScript and JavaScript changes.',
        kind: 'tooling',
        confidence: 0.82,
        evidence: 'Biome configuration is present.',
      });
    }

    if (configNames.has('tsconfig.json') || context.projectFiles.some(file => file.path.endsWith('.ts'))) {
      rules.push({
        text: 'Keep TypeScript changes type-safe and preserve existing module boundaries.',
        kind: 'architecture',
        confidence: 0.74,
        evidence: 'TypeScript configuration and source files are present.',
      });
    }

    if ('bun' in deps || existsSync(join(this.cwd, 'bun.lock'))) {
      rules.push({
        text: 'Use Bun project scripts for local development and verification.',
        kind: 'tooling',
        confidence: 0.78,
        evidence: 'Bun lockfile or dependency metadata is present.',
      });
    }

    if ('ink' in deps || context.projectFiles.some(file => file.content.includes("from '../../ink.js'"))) {
      rules.push({
        text: 'For CLI UI, follow existing Ink components and keep transient flows compact.',
        kind: 'ui',
        confidence: 0.72,
        evidence: 'Ink is used in dependencies and command UI samples.',
      });
    }

    if (sampleText.includes("from '../../components/design-system/") || sampleText.includes('design-system')) {
      rules.push({
        text: 'Reuse the local design-system components instead of adding one-off UI patterns.',
        kind: 'ui',
        confidence: 0.7,
        evidence: 'Source samples import shared design-system components.',
      });
    }

    if (sampleText.includes('bun test') || Object.keys(deps).some(name => name.includes('test'))) {
      rules.push({
        text: 'Run focused verification first, then broaden checks when the change touches shared behavior.',
        kind: 'testing',
        confidence: 0.68,
        evidence: 'Test tooling is configured in project metadata.',
      });
    }

    return {
      rules: rules.slice(0, 8),
      summary: `Heuristic analysis found ${Math.min(rules.length, 8)} patterns.`,
    };
  }

  private parseResponse(text: string): CodebaseAnalysis {
    // Try to extract JSON array from the response
    const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s);
    if (!jsonMatch) {
      // Try extracting from markdown code block
      const blockMatch = text.match(/```(?:json)?\s*(\[\s*\{.*\}\s*\])\s*```/s);
      if (!blockMatch) {
        return { rules: [], summary: 'Failed to parse AI response. Run manually to retry.' };
      }
      return this.parseRules(blockMatch[1]!);
    }
    return this.parseRules(jsonMatch[0]!);
  }

  private parseRules(jsonStr: string): CodebaseAnalysis {
    try {
      const rules = JSON.parse(jsonStr);
      if (!Array.isArray(rules)) {
        return { rules: [], summary: 'AI returned invalid format.' };
      }
      const validKinds = new Set([
        'style',
        'architecture',
        'testing',
        'naming',
        'security',
        'performance',
        'tooling',
        'ui',
        'workflow',
      ]);
      const parsed = rules
        .filter((r: any) => r.text && typeof r.text === 'string')
        .map((r: any) => ({
          text: r.text,
          kind: validKinds.has(r.kind) ? r.kind : 'style',
          confidence: typeof r.confidence === 'number' ? Math.max(0.5, Math.min(0.95, r.confidence)) : 0.7,
          evidence: r.evidence || '',
        }))
        .slice(0, 10);
      return {
        rules: parsed,
        summary: `AI analysis found ${parsed.length} patterns.`,
      };
    } catch {
      return { rules: [], summary: 'Failed to parse AI response.' };
    }
  }

  private getGitLog(): string {
    try {
      return execSync('git log --oneline -50 --no-color', {
        cwd: this.cwd,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      }).trim();
    } catch {
      return '(no git history)';
    }
  }

  private readConfigFiles(): Record<string, string> {
    const configFiles = [
      '.editorconfig',
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.json',
      '.eslintrc.yaml',
      '.prettierrc',
      '.prettierrc.js',
      '.prettierrc.json',
      '.prettierrc.yaml',
      'tsconfig.json',
      '.stylelintrc',
      '.stylelintrc.json',
      'biome.json',
      'biome.jsonc',
      'rustfmt.toml',
      '.rubocop.yml',
    ];
    const result: Record<string, string> = {};
    for (const file of configFiles) {
      const fullPath = join(this.cwd, file);
      if (existsSync(fullPath)) {
        try {
          result[file] = readFileSync(fullPath, 'utf-8').slice(0, 2000);
        } catch {
          /* skip unreadable */
        }
      }
    }
    return result;
  }

  private sampleProjectFiles(): Array<{ path: string; content: string }> {
    const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.rb', '.java']);
    const samples: Array<{ path: string; content: string }> = [];
    const visited = new Set<string>();

    // Walk src/ directory up to depth 4
    const walkDir = (dir: string, depth: number) => {
      if (depth > 4 || samples.length >= 20) return;
      const baseDir = join(this.cwd, dir);
      if (!existsSync(baseDir)) return;
      try {
        const entries = readdirSync(baseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (samples.length >= 20) break;
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;

          const fullPath = join(baseDir, entry.name);
          const relPath = relative(this.cwd, fullPath);
          if (visited.has(relPath)) continue;
          visited.add(relPath);

          try {
            if (entry.isDirectory()) {
              walkDir(join(dir, entry.name), depth + 1);
            } else if (sourceExts.has(extname(entry.name))) {
              const { size } = statSync(fullPath);
              if (size > 0 && size < 50000) {
                // Skip empty or large files
                const content = readFileSync(fullPath, 'utf-8').slice(0, 3000);
                if (content.trim()) {
                  samples.push({ path: relPath, content });
                }
              }
            }
          } catch {
            /* skip unreadable */
          }
        }
      } catch {
        /* skip */
      }
    };

    for (const dir of ['src', 'app', 'lib', 'components', 'pages', 'api', ''] as const) {
      if (samples.length >= 20) break;
      walkDir(dir, 0);
    }
    return samples;
  }

  private getDependencies(): Record<string, string> {
    const pkgPath = join(this.cwd, 'package.json');
    if (!existsSync(pkgPath)) return {};
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      return {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
    } catch {
      return {};
    }
  }
}

export type CodebaseContext = {
  gitLog: string;
  configFiles: Record<string, string>;
  projectFiles: Array<{ path: string; content: string }>;
  dependencies: Record<string, string>;
};
