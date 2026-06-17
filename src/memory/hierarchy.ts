/**
 * Memory Hierarchy — manage `.clew/memory/` directory structure.
 *
 * Creates and maintains the file hierarchy for the MiMo-inspired
 * context reconstruction system.
 *
 * .clew/
 *   memory/
 *     MEMORY.md       # Permanent project knowledge
 *     DECISIONS.md     # Architecture Decision Records
 *     TASTE.md        # Coding style & preferences
 *     checkpoint.md   # Latest session snapshot
 *     notes.md        # Scratchpad (session-scoped)
 *     tasks/          # Per-task artifacts
 *     memory.db       # SQLite database
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getCwd } from '../utils/cwd.js';

const MEMORY_DIR = '.clew/memory';
const TASKS_DIR = join(MEMORY_DIR, 'tasks');

const DEFAULT_FILES: Record<string, string> = {
  'MEMORY.md': `# Project Memory

Auto-managed knowledge base for this project.
Memories are promoted from session checkpoints automatically.
`,

  'DECISIONS.md': `# Architecture Decisions

Key architectural decisions made during development.
Format: YYYY-MM-DD — Decision — Rationale
`,

  'TASTE.md': `# Coding Style & Preferences

Project-specific coding conventions, style preferences,
and patterns to follow.
`,
};

/**
 * Get the project root (CWD).
 */
function getProjectRoot(): string {
  return getCwd();
}

/**
 * Get the path to the .clew/memory directory.
 */
export function getMemoryDirPath(): string {
  return join(getProjectRoot(), MEMORY_DIR);
}

/**
 * Get the path to the SQLite database.
 */
export function getMemoryDbPath(): string {
  return join(getMemoryDirPath(), 'memory.db');
}

/**
 * Initialize the .clew/memory directory structure.
 * Creates directories and default files if they don't exist.
 * Safe to call multiple times — existing files are not overwritten.
 */
export async function initMemoryHierarchy(): Promise<void> {
  const memDir = getMemoryDirPath();
  const tasksDir = join(memDir, 'tasks');

  // Create directories
  await mkdir(memDir, { recursive: true });
  await mkdir(tasksDir, { recursive: true });

  // Create default files if missing
  for (const [filename, content] of Object.entries(DEFAULT_FILES)) {
    const filePath = join(memDir, filename);
    if (!existsSync(filePath)) {
      await writeFile(filePath, content, 'utf8');
    }
  }
}

/**
 * Create a task directory and its default files.
 */
export async function initTaskDir(taskId: string): Promise<string> {
  const taskDir = join(getMemoryDirPath(), 'tasks', taskId);
  await mkdir(taskDir, { recursive: true });

  const files: Record<string, string> = {
    'plan.md': `# Task ${taskId}\n\n## Plan\n\n`,
    'progress.md': `# Progress\n\n- Started: ${new Date().toISOString()}\n`,
    'result.md': `# Result\n\n`,
  };

  for (const [filename, content] of Object.entries(files)) {
    const filePath = join(taskDir, filename);
    if (!existsSync(filePath)) {
      await writeFile(filePath, content, 'utf8');
    }
  }

  return taskDir;
}

/**
 * Read a file from the memory hierarchy.
 * Returns null if the file doesn't exist.
 */
export async function readMemoryFile(filename: string): Promise<string | null> {
  try {
    return await readFile(join(getMemoryDirPath(), filename), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Write to a file in the memory hierarchy.
 */
export async function writeMemoryFile(filename: string, content: string): Promise<void> {
  await writeFile(join(getMemoryDirPath(), filename), content, 'utf8');
}

/**
 * Check if the memory hierarchy is initialized.
 */
export function isMemoryHierarchyInitialized(): boolean {
  return existsSync(join(getMemoryDirPath(), 'memory.db'));
}
