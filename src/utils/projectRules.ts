import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getOriginalCwd } from '../bootstrap/state.js';

const RULES_FILE = '.clew/rules.json';

interface RulesData {
  rules: string[];
  disabled: boolean;
}

async function readRulesFile(cwd?: string): Promise<RulesData | null> {
  const dir = cwd ?? getOriginalCwd();
  const rulesPath = join(dir, RULES_FILE);
  try {
    const data = await readFile(rulesPath, 'utf8');
    const parsed = JSON.parse(data);
    // Backward compat: old format was a plain string array
    if (Array.isArray(parsed)) {
      return {
        rules: parsed.filter((r): r is string => typeof r === 'string'),
        disabled: false,
      };
    }
    return {
      rules: Array.isArray(parsed.rules) ? parsed.rules.filter((r: unknown): r is string => typeof r === 'string') : [],
      disabled: parsed.disabled === true,
    };
  } catch {
    return null;
  }
}

async function writeRulesFile(rules: RulesData, cwd?: string): Promise<void> {
  const dir = cwd ?? getOriginalCwd();
  const rulesPath = join(dir, RULES_FILE);
  const clewDir = join(dir, '.clew');
  if (!existsSync(clewDir)) {
    await mkdir(clewDir, { recursive: true });
  }
  await writeFile(rulesPath, JSON.stringify(rules, null, 2) + '\n', 'utf8');
}

export async function loadProjectRules(cwd?: string): Promise<string[]> {
  const data = await readRulesFile(cwd);
  if (!data) return [];
  return data.rules;
}

export async function isProjectRulesDisabled(cwd?: string): Promise<boolean> {
  const data = await readRulesFile(cwd);
  return data?.disabled === true;
}

export async function setProjectRulesDisabled(disabled: boolean, cwd?: string): Promise<void> {
  const dir = cwd ?? getOriginalCwd();
  const rulesPath = join(dir, RULES_FILE);
  const data = await readRulesFile(dir);

  if (!data) {
    if (disabled) {
      // Persist disabled state even with no rules, so future saves respect it
      await writeRulesFile({ rules: [], disabled: true }, dir);
    }
    return;
  }

  const rulesData: RulesData = data;
  rulesData.disabled = disabled;

  if (rulesData.rules.length === 0 && rulesData.disabled === false) {
    try {
      await unlink(rulesPath);
    } catch {
      /* ignore */
    }
  } else {
    await writeRulesFile(rulesData, dir);
  }
}

export async function saveProjectRule(rule: string, cwd?: string): Promise<void> {
  const dir = cwd ?? getOriginalCwd();
  const data = await readRulesFile(dir);
  const rulesData: RulesData = data ?? { rules: [], disabled: false };
  if (rulesData.rules.includes(rule)) return;
  rulesData.rules.push(rule);
  await writeRulesFile(rulesData, dir);
}

export async function editProjectRule(index: number, newText: string, cwd?: string): Promise<string | null> {
  const dir = cwd ?? getOriginalCwd();
  const data = await readRulesFile(dir);
  if (!data || index < 0 || index >= data.rules.length) return null;
  const old = data.rules[index];
  data.rules[index] = newText;
  await writeRulesFile(data, dir);
  return old;
}

export async function removeProjectRule(index: number, cwd?: string): Promise<string | null> {
  const dir = cwd ?? getOriginalCwd();
  const rulesPath = join(dir, RULES_FILE);
  const data = await readRulesFile(dir);
  if (!data || index < 0 || index >= data.rules.length) return null;
  const removed = data.rules[index];
  data.rules.splice(index, 1);
  if (data.rules.length === 0 && !data.disabled) {
    try {
      await unlink(rulesPath);
    } catch {
      /* ignore */
    }
  } else {
    await writeRulesFile(data, dir);
  }
  return removed;
}

export function formatRulesNotification(rules: string[]): string {
  if (rules.length === 0) return '';
  return rules.map((rule, i) => `rule: ${i + 1}) ${rule}`).join(' / ');
}
