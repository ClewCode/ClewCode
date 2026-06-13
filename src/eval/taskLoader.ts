import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { EvalConfig, EvalGrader, EvalTask } from './types.js';

function valueFor(markdown: string, key: string): string | undefined {
  const match = markdown.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim();
}

function listFor(markdown: string, key: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `${key}:`);
  if (start === -1) return [];
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s*-\s+(.+)$/);
    if (!match) break;
    values.push(match[1]!.trim());
  }
  return values;
}

async function collectYamlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectYamlFiles(fullPath)));
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function loadTasks(config: EvalConfig): Promise<EvalTask[]> {
  const files = await collectYamlFiles(config.tasksDir);
  return Promise.all(
    files.map(async file => {
      const text = await readFile(file, 'utf-8');
      return {
        id: valueFor(text, 'id') ?? 'unknown.task',
        title: valueFor(text, 'title') ?? 'Untitled task',
        category: valueFor(text, 'category') ?? 'uncategorized',
        input: valueFor(text, 'input') ?? '',
        graders: listFor(text, 'graders'),
      };
    }),
  );
}

export async function loadGraders(config: EvalConfig): Promise<EvalGrader[]> {
  const files = await collectYamlFiles(config.gradersDir);
  return Promise.all(
    files.map(async file => {
      const text = await readFile(file, 'utf-8');
      return {
        id: valueFor(text, 'id') ?? 'unknown-grader',
        type: (valueFor(text, 'type') ?? 'rule') as EvalGrader['type'],
        command: valueFor(text, 'command'),
        mustInclude: listFor(text, 'mustInclude'),
        mustNotInclude: listFor(text, 'mustNotInclude'),
      } as EvalGrader;
    }),
  );
}
