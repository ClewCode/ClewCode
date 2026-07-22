import { readFile } from 'fs/promises';
import type { EvalGrader, EvalTask, GraderContext, GraderResult } from '../types.js';

function result(
  graderId: string,
  status: GraderResult['status'],
  score: number,
  failureReasons: string[] = [],
): GraderResult {
  return { graderId, status, score, failureReasons };
}

function matchesGlob(filePath: string, pattern: string): boolean {
  const normalizedFile = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');
  if (normalizedPattern.endsWith('/**')) {
    return normalizedFile.startsWith(normalizedPattern.slice(0, -3));
  }
  if (normalizedPattern.includes('*')) {
    const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    return new RegExp(`^${escaped}$`).test(normalizedFile);
  }
  return normalizedFile === normalizedPattern;
}

export async function gradeWithGrader(
  grader: EvalGrader,
  _task: EvalTask,
  context: GraderContext,
): Promise<GraderResult> {
  if (grader.type === 'rule') {
    const output = context.agentOutput ?? '';
    const missing = (grader.mustInclude ?? []).filter(term => !output.includes(term));
    const forbidden = (grader.mustNotInclude ?? []).filter(term => output.includes(term));
    const failures = [
      ...missing.map(term => `Missing required text: ${term}`),
      ...forbidden.map(term => `Forbidden text: ${term}`),
    ];
    return failures.length === 0 ? result(grader.id, 'pass', 1) : result(grader.id, 'fail', 0, failures);
  }

  if (grader.type === 'artifact') {
    const changedFiles = context.changedFiles ?? [];
    const checks = grader.checks;
    const failures: string[] = [];
    if (checks?.maxChangedFiles !== undefined && changedFiles.length > checks.maxChangedFiles) {
      failures.push(`Changed ${changedFiles.length} files, max is ${checks.maxChangedFiles}`);
    }
    if (checks?.changedFiles?.allow?.length) {
      for (const file of changedFiles) {
        if (!checks.changedFiles.allow.some(pattern => matchesGlob(file, pattern))) {
          failures.push(`Changed file not allowed: ${file}`);
        }
      }
    }
    if (checks?.changedFiles?.deny?.length) {
      for (const file of changedFiles) {
        if (checks.changedFiles.deny.some(pattern => matchesGlob(file, pattern))) {
          failures.push(`Changed file denied: ${file}`);
        }
      }
    }
    return failures.length === 0 ? result(grader.id, 'pass', 1) : result(grader.id, 'fail', 0, failures);
  }

  if (grader.type === 'trace') {
    const tracePath = context.tracePath;
    if (!tracePath) return result(grader.id, 'fail', 0, ['Missing trace path']);
    const events = (await readFile(tracePath, 'utf-8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line) as { type?: string });
    const failures: string[] = [];
    for (const rule of grader.rules ?? []) {
      const targetIndex = events.findIndex(event => event.type === rule.before);
      if (targetIndex === -1) continue;
      const priorTypes = new Set(events.slice(0, targetIndex).map(event => event.type));
      if (!rule.requireAny.some(type => priorTypes.has(type))) {
        failures.push(`Trace rule failed before ${rule.before}: require one of ${rule.requireAny.join(', ')}`);
      }
    }
    return failures.length === 0 ? result(grader.id, 'pass', 1) : result(grader.id, 'fail', 0, failures);
  }

  return result(grader.id, 'pass', 1);
}
