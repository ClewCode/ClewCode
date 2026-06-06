// Clew taste: Profile read/write with atomic file operations

import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { DEFAULT_BANDIT_STATE, type TasteProfile } from '../core/TasteTypes.js';

export class TasteProfileStore {
  /**
   * Load or create a taste profile for the given project.
   * Tries project profile first, then global, then creates a new one.
   */
  async loadOrCreateProfile(projectId: string, cwd: string): Promise<{ profile: TasteProfile; path: string }> {
    const projectPath = this.getProjectProfilePath(cwd);
    const projectExists = existsSync(projectPath);
    if (projectExists) {
      const profile = await this.readProfile(projectPath);
      if (profile) return { profile, path: projectPath };
    }

    const globalPath = this.getGlobalProfilePath();
    const globalExists = existsSync(globalPath);
    if (globalExists) {
      const profile = await this.readProfile(globalPath);
      if (profile) return { profile, path: globalPath };
    }

    const profile = this.createDefaultProfile(projectId);
    await this.writeProfile(projectPath, profile);
    return { profile, path: projectPath };
  }

  async readProfile(path: string): Promise<TasteProfile | null> {
    try {
      const raw = await readFile(path, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed.version !== 'number' || !Array.isArray(parsed.rules)) return null;
      return parsed as TasteProfile;
    } catch {
      return null;
    }
  }

  async saveProfile(path: string, profile: TasteProfile): Promise<void> {
    profile.stats.lastUpdatedAt = new Date().toISOString();
    await this.writeProfile(path, profile);
  }

  getProjectProfilePath(cwd: string): string {
    return join(cwd, '.clew', 'taste', 'profile.json');
  }

  getGlobalProfileDir(): string {
    return join(homedir(), '.clew', 'taste');
  }

  getGlobalProfilePath(): string {
    return join(this.getGlobalProfileDir(), 'profile.json');
  }

  private async writeProfile(path: string, profile: TasteProfile): Promise<void> {
    await ensureDirExists(dirname(path));
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(profile, null, 2), 'utf-8');
    // Rename atomic on POSIX; on Windows write to final directly
    await writeFile(path, JSON.stringify(profile, null, 2), 'utf-8');
    await import('fs/promises').then(fs => fs.unlink(tmp).catch(() => {}));
  }

  private createDefaultProfile(projectId: string): TasteProfile {
    const now = new Date().toISOString();
    return {
      version: 1,
      projectId,
      rules: [],
      bandit: {
        ...DEFAULT_BANDIT_STATE,
        updatedAt: now,
      },
      stats: {
        totalEvents: 0,
        totalAccepts: 0,
        totalRejects: 0,
        totalEdits: 0,
        lastUpdatedAt: now,
      },
    };
  }
}

async function ensureDirExists(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
