/**
 * Parallel search utility — runs multiple GrepTool-style searches concurrently.
 *
 * ripgrep itself is already multi-threaded internally, but parallelizing
 * *multiple* searches (different patterns, directories, or globs) gives
 * significant speedup when the LLM would otherwise make N sequential calls.
 *
 * Each task runs independently via Promise.allSettled so one failure
 * doesn't cancel the others.
 */

import { expandPath } from './path.js';
import { ripGrep } from './ripgrep.js';
import { getCachedSearch, searchCacheKey, setCachedSearch } from './searchCache.js';

// Version control system directories to exclude from searches
const VCS_DIRECTORIES_TO_EXCLUDE = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'];

export interface SearchTask {
  pattern: string;
  /** Directory to search in (defaults to cwd of the caller) */
  path?: string;
  /** Glob filter (e.g. "*.ts", "*.{ts,js}") */
  glob?: string;
  /** File type filter (e.g. "js", "py", "rust") */
  type?: string;
  output_mode: 'files_with_matches' | 'content' | 'count';
  head_limit?: number;
  offset?: number;
  multiline?: boolean;
  case_insensitive?: boolean;
}

export interface ParallelSearchResultTask {
  task: SearchTask;
  results: string[];
  error?: string;
}

export interface ParallelSearchResult {
  tasks: ParallelSearchResultTask[];
  /** Deduplicated file paths across all files_with_matches tasks */
  deduplicatedPaths: string[];
}

/**
 * Build ripgrep args for a single search task.
 */
function buildArgs(task: SearchTask, cwd: string): string[] {
  const args: string[] = ['--hidden'];

  // Exclude VCS directories
  for (const dir of VCS_DIRECTORIES_TO_EXCLUDE) {
    args.push('--glob', `!${dir}`);
  }

  args.push('--max-columns', '500');

  if (task.multiline) {
    args.push('-U', '--multiline-dotall');
  }
  if (task.case_insensitive) {
    args.push('-i');
  }
  if (task.output_mode === 'files_with_matches') {
    args.push('-l');
  } else if (task.output_mode === 'count') {
    args.push('-c');
  }

  // Add pattern
  if (task.pattern.startsWith('-')) {
    args.push('-e', task.pattern);
  } else {
    args.push(task.pattern);
  }

  // Type filter
  if (task.type) {
    args.push('--type', task.type);
  }

  // Glob filter
  if (task.glob) {
    const globPatterns: string[] = [];
    for (const raw of task.glob.split(/\s+/)) {
      if (raw.includes('{') && raw.includes('}')) {
        globPatterns.push(raw);
      } else {
        globPatterns.push(...raw.split(',').filter(Boolean));
      }
    }
    for (const g of globPatterns.filter(Boolean)) {
      args.push('--glob', g);
    }
  }

  return args;
}

/**
 * Execute one search task and return parsed results.
 * Results are returned as-is from ripGrep (no stat() sorting, no relativization —
 * caller can post-process if needed).
 */
async function executeOne(task: SearchTask, abortSignal: AbortSignal, cwd: string): Promise<string[]> {
  const absolutePath = task.path ? expandPath(task.path) : cwd;

  // Check cache first (files_with_matches only — content/count too memory-heavy)
  if (task.output_mode === 'files_with_matches') {
    const cacheKey = searchCacheKey({
      pattern: task.pattern,
      absolutePath,
      glob: task.glob,
      type: task.type,
      outputMode: task.output_mode,
      multiline: task.multiline,
      caseInsensitive: task.case_insensitive,
    });
    const cached = getCachedSearch(cacheKey);
    if (cached !== null) return cached;
  }

  const args = buildArgs(task, cwd);
  const results = await ripGrep(args, absolutePath, abortSignal);

  // Cache result (files_with_matches only)
  if (task.output_mode === 'files_with_matches') {
    const cacheKey = searchCacheKey({
      pattern: task.pattern,
      absolutePath,
      glob: task.glob,
      type: task.type,
      outputMode: task.output_mode,
      multiline: task.multiline,
      caseInsensitive: task.case_insensitive,
    });
    setCachedSearch(cacheKey, results);
  }

  // Apply pagination
  const effectiveLimit = task.head_limit ?? 250;
  const sliced =
    task.head_limit === 0
      ? results.slice(task.offset ?? 0)
      : results.slice(task.offset ?? 0, (task.offset ?? 0) + effectiveLimit);

  return sliced;
}

/**
 * Run multiple search tasks **in parallel** and return aggregated results.
 *
 * - Each task gets its own ripgrep process
 * - One failure doesn't cancel other tasks (uses allSettled)
 * - files_with_matches results are deduplicated into `deduplicatedPaths`
 * - Cached tasks return instantly without spawning a process
 */
export async function parallelSearch(
  tasks: SearchTask[],
  abortSignal: AbortSignal,
  cwd: string,
): Promise<ParallelSearchResult> {
  const settled = await Promise.allSettled(
    tasks.map(task => executeOne(task, abortSignal, cwd).then(results => ({ task, results }))),
  );

  const taskResults: ParallelSearchResultTask[] = [];
  const allPaths = new Set<string>();

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      taskResults.push({
        task: s.value.task as SearchTask,
        results: s.value.results,
      });
      if (s.value.task.output_mode === 'files_with_matches') {
        for (const p of s.value.results) {
          allPaths.add(p);
        }
      }
    } else {
      // Find the original task by matching position — not ideal but practical
      // The consumer gets error information without crashing the batch
      taskResults.push({
        task: tasks[taskResults.length]!, // approximate — works because allSettled preserves order
        results: [],
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
    }
  }

  return {
    tasks: taskResults,
    deduplicatedPaths: [...allPaths],
  };
}
