import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { getFsImplementation } from '../utils/fsOperations.js';
import { parseYaml } from '../utils/yaml.js';
import type { EvalCategory, EvalConfig, EvalTask, GraderConfig, GraderType } from './types.js';

async function getFilesRecursively(dir: string): Promise<string[]> {
  const fsImpl = getFsImplementation();
  if (!fsImpl.existsSync(dir)) return [];
  const entries = await readdir(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      const subFiles = await getFilesRecursively(fullPath);
      files.push(...subFiles);
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function loadTasks(config: EvalConfig): Promise<EvalTask[]> {
  const filePaths = await getFilesRecursively(config.tasksDir);
  const tasks: EvalTask[] = [];

  for (const filePath of filePaths) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const raw = parseYaml(content) as Record<string, any>;

      if (!raw || typeof raw !== 'object') continue;
      if (!raw.id || !raw.title || !raw.category) {
        throw new Error(`Task is missing id, title, or category in ${filePath}`);
      }

      // Convert snake_case from YAML to camelCase in TS
      const expected = raw.expected
        ? {
            filesChanged: raw.expected.files_changed,
            filesNotChanged: raw.expected.files_not_changed,
            commandsRun: raw.expected.commands_run,
            citationsRequired: raw.expected.citations_required,
            testsMustPass: raw.expected.tests_must_pass,
            forbiddenActions: raw.expected.forbidden_actions,
            minSources: raw.expected.min_sources,
            sourceTypes: raw.expected.source_types,
            reportSections: raw.expected.report_sections,
            requireSourceType: raw.expected.require_source_type,
            rejectSourceTypeAsPrimary: raw.expected.reject_source_type_as_primary,
            mustInclude: raw.expected.must_include,
            mustNotInclude: raw.expected.must_not_include,
            destructiveCommandsRequireApproval: raw.expected.destructive_commands_require_approval,
            forbiddenWithoutApproval: raw.expected.forbidden_without_approval,
          }
        : undefined;

      const budgets = raw.budgets
        ? {
            maxSteps: raw.budgets.max_steps,
            maxToolCalls: raw.budgets.max_tool_calls,
            maxDurationMs: raw.budgets.max_duration_ms,
            maxCostUsd: raw.budgets.max_cost_usd,
          }
        : undefined;

      const task: EvalTask = {
        id: String(raw.id),
        title: String(raw.title),
        category: raw.category as EvalCategory,
        input: String(raw.input || ''),
        workspaceFixture: raw.workspace_fixture ? String(raw.workspace_fixture) : undefined,
        expected,
        graders: Array.isArray(raw.graders) ? raw.graders.map(String) : [],
        budgets,
      };

      tasks.push(task);
    } catch (err: any) {
      console.error(`Failed to parse task file ${filePath}: ${err.message}`);
    }
  }

  return tasks;
}

export async function loadGraders(config: EvalConfig): Promise<GraderConfig[]> {
  const fsImpl = getFsImplementation();
  if (!fsImpl.existsSync(config.gradersDir)) return [];
  const entries = await readdir(config.gradersDir);
  const graders: GraderConfig[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
    const filePath = join(config.gradersDir, entry);
    try {
      const content = await readFile(filePath, 'utf-8');
      const raw = parseYaml(content) as Record<string, any>;

      if (!raw || typeof raw !== 'object') continue;
      if (!raw.id || !raw.type) {
        throw new Error(`Grader is missing id or type in ${filePath}`);
      }

      // Convert trace rules snake_case -> camelCase
      const rules = Array.isArray(raw.rules)
        ? raw.rules.map((r: any) => ({
            before: r.before,
            requireAny: r.require_any,
          }))
        : undefined;

      // Convert checks snake_case -> camelCase
      const checks = raw.checks
        ? {
            changedFiles: raw.checks.changed_files
              ? {
                  allow: raw.checks.changed_files.allow,
                  deny: raw.checks.changed_files.deny,
                }
              : undefined,
            maxChangedFiles: raw.checks.max_changed_files,
          }
        : undefined;

      const grader: GraderConfig = {
        id: String(raw.id),
        type: raw.type as GraderType,
        commands: Array.isArray(raw.commands) ? raw.commands.map(String) : undefined,
        passWhen: raw.pass_when
          ? {
              exitCode: raw.pass_when.exit_code,
            }
          : undefined,
        rules,
        failMessage: raw.fail_message ? String(raw.fail_message) : undefined,
        checks,
        mustInclude: Array.isArray(raw.must_include) ? raw.must_include.map(String) : undefined,
        mustNotInclude: Array.isArray(raw.must_not_include) ? raw.must_not_include.map(String) : undefined,
      };

      graders.push(grader);
    } catch (err: any) {
      console.error(`Failed to parse grader file ${filePath}: ${err.message}`);
    }
  }

  return graders;
}
