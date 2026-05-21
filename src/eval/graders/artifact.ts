import type { EvalTask, GraderConfig, GraderResult } from '../types.js';
import type { GraderContext } from './index.js';

function matchPattern(path: string, pattern: string): boolean {
  // Convert simple glob pattern to RegExp
  const regexString = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex chars
    .replace(/\*\*/g, '.*') // Match any nested paths
    .replace(/\*/g, '[^/]*'); // Match single level
  const regex = new RegExp(`^${regexString}$`);
  return regex.test(path);
}

export async function runArtifactGrader(
  grader: GraderConfig,
  task: EvalTask,
  context: GraderContext,
): Promise<GraderResult> {
  const failureReasons: string[] = [];
  const changedFiles = context.changedFiles || [];
  const checks = grader.checks;

  if (!checks) {
    return {
      graderId: grader.id,
      status: 'pass',
      score: 1.0,
      failureReasons: [],
    };
  }

  // Check max changed files
  if (checks.maxChangedFiles !== undefined && changedFiles.length > checks.maxChangedFiles) {
    failureReasons.push(
      `Artifact Scope Creep: Changed ${changedFiles.length} files, which exceeds the maximum limit of ${checks.maxChangedFiles} files.`,
    );
  }

  const allowedPatterns = checks.changedFiles?.allow || [];
  const deniedPatterns = checks.changedFiles?.deny || [];

  for (const file of changedFiles) {
    // If allow patterns are configured, the changed file MUST match at least one of them
    if (allowedPatterns.length > 0) {
      const isAllowed = allowedPatterns.some(pattern => matchPattern(file, pattern));
      if (!isAllowed) {
        failureReasons.push(`Artifact Scope Violation: File "${file}" is not in the allowed files list.`);
      }
    }

    // If deny patterns are configured, the changed file MUST NOT match any of them
    if (deniedPatterns.length > 0) {
      const isDenied = deniedPatterns.some(pattern => matchPattern(file, pattern));
      if (isDenied) {
        failureReasons.push(`Artifact Policy Violation: File "${file}" matches a denied pattern.`);
      }
    }
  }

  const passed = failureReasons.length === 0;

  return {
    graderId: grader.id,
    status: passed ? 'pass' : 'fail',
    score: passed ? 1.0 : 0.0,
    failureReasons,
  };
}
