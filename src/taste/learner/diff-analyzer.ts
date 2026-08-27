/**
 * Semantic diff analyzer for Taste learning.
 * Extracts intent and coding patterns from differences between generated and final user code.
 */

export interface SemanticPattern {
  category: 'coding' | 'architecture' | 'testing' | 'tooling' | 'workflow' | 'language';
  rule: string;
  weight: number;
  language?: string;
  explanation: string;
}

export function analyzeSemanticDiff(beforeText?: string, afterText?: string, language?: string): SemanticPattern[] {
  if (!beforeText || !afterText || beforeText === afterText) {
    return [];
  }

  const patterns: SemanticPattern[] = [];

  // 1. Export style pattern: default export -> named export
  const hadDefaultExport = /export\s+default\s+/i.test(beforeText);
  const hasDefaultExport = /export\s+default\s+/i.test(afterText);
  const hasNamedExport = /export\s+(const|function|class|interface|type)\s+/i.test(afterText);

  if (hadDefaultExport && !hasDefaultExport && hasNamedExport) {
    patterns.push({
      category: 'language',
      rule: 'Prefer named exports over default exports.',
      language: language || 'typescript',
      weight: 0.35,
      explanation: 'User converted default export to named export',
    });
  }

  // 2. TypeScript Explicit Return Types
  if (language === 'typescript' || language === 'ts' || language === 'tsx') {
    const fnWithoutReturnType = /function\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{/.test(beforeText);
    const fnWithReturnType =
      /function\s+[a-zA-Z0-9_]+\s*\([^)]*\)\s*:\s*[a-zA-Z_$][a-zA-Z0-9_$<>[\]|&\s,.:]*\s*\{/.test(afterText);

    if (fnWithoutReturnType && fnWithReturnType) {
      patterns.push({
        category: 'language',
        rule: 'Prefer explicit return types on exported functions.',
        language: 'typescript',
        weight: 0.3,
        explanation: 'User added explicit return type annotation to function signature',
      });
    }
  }

  // 3. Minimal Diff / Avoid Unnecessary Refactor
  const linesBefore = beforeText.split('\n').length;
  const linesAfter = afterText.split('\n').length;
  // If user trimmed a huge AI refactor down to a surgical 1-3 line edit
  if (linesBefore > 30 && linesAfter < 10) {
    patterns.push({
      category: 'workflow',
      rule: 'Prefer minimal, surgical diffs over broad refactoring during bugfixes.',
      weight: 0.4,
      explanation: 'User trimmed broad generated code down to a focused surgical edit',
    });
  }

  return patterns;
}
