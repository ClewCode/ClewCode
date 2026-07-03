import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getOriginalCwd } from '../bootstrap/state.js';

const RULES_FILE = '.clew/rules.json';

export async function loadProjectRules(cwd?: string): Promise<string[]> {
  const dir = cwd ?? getOriginalCwd();
  const rulesPath = join(dir, RULES_FILE);
  try {
    const data = await readFile(rulesPath, 'utf8');
    const rules = JSON.parse(data);
    return Array.isArray(rules) ? rules.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveProjectRule(rule: string, cwd?: string): Promise<void> {
  const dir = cwd ?? getOriginalCwd();
  const rulesPath = join(dir, RULES_FILE);
  const rules = await loadProjectRules(dir);
  if (rules.includes(rule)) return;
  rules.push(rule);
  const clewDir = join(dir, '.clew');
  if (!existsSync(clewDir)) {
    await mkdir(clewDir, { recursive: true });
  }
  await writeFile(rulesPath, JSON.stringify(rules, null, 2) + '\n', 'utf8');
}

export async function removeProjectRule(index: number, cwd?: string): Promise<string | null> {
  const dir = cwd ?? getOriginalCwd();
  const rulesPath = join(dir, RULES_FILE);
  const rules = await loadProjectRules(dir);
  if (index < 0 || index >= rules.length) return null;
  const removed = rules[index];
  rules.splice(index, 1);
  if (rules.length === 0) {
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(rulesPath);
    } catch {
      // File may not exist — ignore
    }
  } else {
    await writeFile(rulesPath, JSON.stringify(rules, null, 2) + '\n', 'utf8');
  }
  return removed;
}

export function formatRulesNotification(rules: string[]): string {
  if (rules.length === 0) return '';
  return rules.map((rule, i) => `rule: ${i + 1}) ${rule}`).join(' / ');
}
