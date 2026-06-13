import path from 'node:path';
import { AGENTS_DIR, DOT_CLEW, RUNS_DIR, WORKFLOWS_DIR } from '../utils/clewPaths.js';
import type { AgentDefinition, RuntimeBudget, WorkflowDefinition } from './types.js';

export const RUNTIME_DIRS = {
  runs: `${DOT_CLEW}/${RUNS_DIR}`,
  agents: `${DOT_CLEW}/${AGENTS_DIR}`,
  workflows: `${DOT_CLEW}/${WORKFLOWS_DIR}`,
};

export const DEFAULT_BUDGET: RuntimeBudget = {
  maxSteps: 40,
  maxToolCalls: 120,
  maxLlmCalls: 40,
  timeoutMs: 1800000, // 30 mins
  maxOutputBytesPerTool: 20000,
  maxPatchBytes: 100000,
  maxChangedFiles: 20,
  maxCostUsd: null,
};

export function resolveRuntimePath(workspaceRoot: string, subDir: keyof typeof RUNTIME_DIRS): string {
  return path.join(workspaceRoot, RUNTIME_DIRS[subDir]);
}

export const BUILTIN_AGENTS: Record<string, AgentDefinition> = {
  planner: {
    name: 'planner',
    description: 'Creates technical implementation plans and analyzes tasks',
    model: 'default',
    max_steps: 10,
    tools: ['repo.search', 'repo.open', 'memory.search'],
    permissions: {
      read_files: 'allow',
      write_files: 'deny',
      shell: 'deny',
      network: 'deny',
      memory_write: 'deny',
    },
    handoff_to: ['coder', 'researcher'],
    systemPrompt: `You are the Planner Agent. Your job is to understand the user's task, inspect the codebase, and write a concrete technical plan.
You must not edit any files or execute shell tests directly. Detail which files need modification and hand off to the Coder Agent.`,
  },
  coder: {
    name: 'coder',
    description: 'Implements targeted, minimal code changes to solve bugs/features',
    model: 'default',
    max_steps: 20,
    tools: ['repo.search', 'repo.open', 'repo.patch', 'shell.run', 'memory.search'],
    permissions: {
      read_files: 'allow',
      write_files: 'allow',
      shell: 'guarded',
      network: 'deny',
      memory_write: 'pending_only',
    },
    handoff_to: ['tester', 'reviewer'],
    systemPrompt: `You are the Coder Agent. Your job is to implement code changes targeting the exact bug or feature.
Keep your changes minimal and scoped. Do not refactor unrelated files.
After applying a patch, hand off to the Tester Agent.`,
  },
  tester: {
    name: 'tester',
    description: 'Executes tests and verifies code correctness',
    model: 'default',
    max_steps: 15,
    tools: ['repo.search', 'repo.open', 'shell.run'],
    permissions: {
      read_files: 'allow',
      write_files: 'deny',
      shell: 'allow',
      network: 'deny',
      memory_write: 'deny',
    },
    handoff_to: ['coder', 'reviewer'],
    systemPrompt: `You are the Tester Agent. Your job is to run unit tests, typechecks, and verify that code changes solve the target task without regression.
Be thorough. If tests fail, hand off back to the Coder Agent with details of the failure.`,
  },
  reviewer: {
    name: 'reviewer',
    description: 'Conducts security, style, and code reviews',
    model: 'default',
    max_steps: 10,
    tools: ['repo.search', 'repo.open'],
    permissions: {
      read_files: 'allow',
      write_files: 'deny',
      shell: 'deny',
      network: 'deny',
      memory_write: 'deny',
    },
    handoff_to: ['coder'],
    systemPrompt: `You are the Reviewer Agent. Your job is to inspect file diffs, search for coding standard violations, performance smells, or security bugs.
If you approve the changes, mark the task complete. Otherwise, hand off back to the Coder Agent with clear feedback.`,
  },
};

export const BUILTIN_WORKFLOWS: Record<string, WorkflowDefinition> = {
  'coding-task': {
    name: 'coding-task',
    description: 'Plan, implement, test, and review a coding task.',
    entry: 'planner',
    agents: {
      planner: {
        next: ['coder', 'researcher'],
      },
      coder: {
        next: ['tester', 'reviewer'],
      },
      tester: {
        next: ['reviewer', 'coder'],
      },
      reviewer: {
        next: ['coder'],
      },
    },
    budgets: {
      maxSteps: 50,
      maxToolCalls: 160,
    },
    approval: {
      required_for: ['shell.network', 'shell.destructive', 'git.commit', 'git.push'],
    },
    verification: {
      required: ['typecheck_or_explain', 'relevant_tests_or_explain'],
    },
  },
};
