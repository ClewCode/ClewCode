// Clew taste: Export/import package store for sharing taste profiles

import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { extname, join } from 'path';
import type { TasteProfile, TasteRule } from '../core/TasteTypes.js';

export type TastePackage = {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: string;
  rules: TasteRule[];
  tags: string[];
};

export function getProjectPackagesDir(cwd: string): string {
  return join(cwd, '.clew', 'taste', 'packages');
}

export function getGlobalPackagesDir(): string {
  return join(homedir(), '.clew', 'taste', 'packages');
}

export async function listPackages(dir: string): Promise<TastePackage[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const packages: TastePackage[] = [];
  for (const entry of entries) {
    if (entry.isFile() && extname(entry.name) === '.json') {
      try {
        const raw = await readFile(join(dir, entry.name), 'utf-8');
        const pkg = JSON.parse(raw) as TastePackage;
        packages.push(pkg);
      } catch {
        // skip malformed
      }
    }
  }
  return packages;
}

export async function exportPackage(
  profile: TasteProfile,
  name: string,
  description: string,
  targetDir: string,
  ruleIds?: string[],
): Promise<string> {
  const pkg: TastePackage = {
    id: randomUUID(),
    name,
    description,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    rules: ruleIds ? profile.rules.filter(r => ruleIds.includes(r.id)) : profile.rules.filter(r => r.confidence >= 0.7),
    tags: [],
  };

  await ensureDirExists(targetDir);
  const filePath = join(targetDir, `${name.replace(/\s+/g, '_')}.json`);
  await writeFile(filePath, JSON.stringify(pkg, null, 2), 'utf-8');
  return filePath;
}

export async function importPackage(filePath: string): Promise<TastePackage | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const pkg = JSON.parse(raw) as TastePackage;
    if (!pkg.rules || !Array.isArray(pkg.rules)) return null;
    return pkg;
  } catch {
    return null;
  }
}

export async function mergePackageIntoProfile(
  pkg: TastePackage,
  profile: TasteProfile,
  source: 'imported',
): Promise<TasteProfile> {
  const now = new Date().toISOString();
  const existingIds = new Set(profile.rules.map(r => r.id));
  let _importedCount = 0;

  for (const rule of pkg.rules) {
    if (existingIds.has(rule.id)) {
      // Update existing rule weight instead of duplicating
      const idx = profile.rules.findIndex(r => r.id === rule.id);
      if (idx !== -1) {
        profile.rules[idx] = {
          ...profile.rules[idx],
          weight: Math.max(profile.rules[idx].weight, rule.weight),
          confidence: Math.max(profile.rules[idx].confidence, rule.confidence),
          updatedAt: now,
          source,
        };
      }
      continue;
    }

    profile.rules.push({
      ...rule,
      id: randomUUID(),
      source,
      createdAt: now,
      updatedAt: now,
    });
    _importedCount++;
  }

  return profile;
}

async function ensureDirExists(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
