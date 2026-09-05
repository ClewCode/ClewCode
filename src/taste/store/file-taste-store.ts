/**
 * Filesystem TasteStore — Markdown+YAML SoT, no SQLite.
 *
 * Layout:
 *   <root>/.clew/taste/
 *     rules/<id>.md
 *     evidence/<id>.md
 *     conflicts/<id>.md
 *     index.json (derived, gitignored)
 *
 * Supports project + global scopes (two roots).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DOT_CLEW, TASTE_DIR } from '../../utils/clewPaths.js';
import { getCwd } from '../../utils/cwd.js';
import type {
  TasteCategory,
  TasteConflict,
  TasteEvidence,
  TasteQuery,
  TasteRule,
  TasteSignal,
  TasteStore,
} from '../types.js';

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'taste';
}

function getProjectRoot(): string {
  try {
    return getCwd();
  } catch {
    return process.cwd();
  }
}
function getProjectTasteDir(): string {
  return join(getProjectRoot(), DOT_CLEW, TASTE_DIR);
}
function getGlobalTasteDir(): string {
  return join(homedir(), DOT_CLEW, TASTE_DIR);
}
function getProjectRulesDir(): string {
  return join(getProjectTasteDir(), 'rules');
}
function getGlobalRulesDir(): string {
  return join(getGlobalTasteDir(), 'rules');
}
function getEvidenceDir(): string {
  return join(getProjectTasteDir(), 'evidence');
}
function getConflictsDir(): string {
  return join(getProjectTasteDir(), 'conflicts');
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function ruleFilePath(id: string, scopeType: 'global' | 'project'): string {
  const dir = scopeType === 'global' ? getGlobalRulesDir() : getProjectRulesDir();
  return join(dir, `${sanitizeId(id)}.md`);
}
function evidenceFilePath(id: string): string {
  return join(getEvidenceDir(), `${sanitizeId(id)}.md`);
}
function conflictFilePath(id: string): string {
  return join(getConflictsDir(), `${sanitizeId(id)}.md`);
}

function stringifyRule(rule: TasteRule): string {
  const lines = ['---'];
  lines.push(`id: ${rule.id}`);
  lines.push(`rule: ${JSON.stringify(rule.rule)}`);
  lines.push(`category: ${rule.category}`);
  lines.push(`scope_type: ${rule.scope.type}`);
  if (rule.scope.language) lines.push(`scope_language: ${rule.scope.language}`);
  if (rule.scope.repository) lines.push(`scope_repository: ${rule.scope.repository}`);
  lines.push(`confidence: ${rule.confidence}`);
  lines.push(`status: ${rule.status}`);
  lines.push(`source: ${rule.source}`);
  lines.push(`evidence_count: ${rule.evidenceCount}`);
  lines.push(`positive_evidence: ${rule.positiveEvidence}`);
  lines.push(`negative_evidence: ${rule.negativeEvidence}`);
  lines.push(`created_at: ${rule.createdAt}`);
  lines.push(`updated_at: ${rule.updatedAt}`);
  lines.push(`last_observed_at: ${rule.lastObservedAt}`);
  lines.push('---', '', rule.rule);
  return lines.join('\n');
}

function parseRule(raw: string): TasteRule | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const [, yaml, body] = m;
  const meta: Record<string, string> = {};
  for (const line of yaml.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      try {
        v = JSON.parse(v) as string;
      } catch {
        v = v.slice(1, -1);
      }
    }
    meta[k] = v;
  }
  const ruleText = meta.rule || body.trim();
  return {
    id: meta.id || '',
    rule: ruleText,
    category: (meta.category as TasteCategory) || 'coding',
    scope: {
      type: (meta.scope_type as 'global' | 'project') || 'project',
      language: meta.scope_language || undefined,
      repository: meta.scope_repository || undefined,
    },
    confidence: meta.confidence ? Number.parseFloat(meta.confidence) : 1,
    status: (meta.status as any) || 'active',
    source: (meta.source as any) || 'explicit',
    evidenceCount: meta.evidence_count ? Number.parseInt(meta.evidence_count, 10) : 0,
    positiveEvidence: meta.positive_evidence ? Number.parseInt(meta.positive_evidence, 10) : 0,
    negativeEvidence: meta.negative_evidence ? Number.parseInt(meta.negative_evidence, 10) : 0,
    createdAt: meta.created_at || new Date().toISOString(),
    updatedAt: meta.updated_at || new Date().toISOString(),
    lastObservedAt: meta.last_observed_at || new Date().toISOString(),
  };
}

function stringifyEvidence(e: TasteEvidence): string {
  const lines = ['---'];
  lines.push(`id: ${e.id}`);
  lines.push(`task_id: ${e.taskId}`);
  if (e.ruleId) lines.push(`rule_id: ${e.ruleId}`);
  lines.push(`signal: ${e.signal}`);
  lines.push(`weight: ${e.weight}`);
  if (e.before) lines.push(`before_text: ${JSON.stringify(e.before)}`);
  if (e.after) lines.push(`after_text: ${JSON.stringify(e.after)}`);
  if (e.filePath) lines.push(`file_path: ${e.filePath}`);
  if (e.details) lines.push(`details: ${JSON.stringify(e.details)}`);
  lines.push(`created_at: ${e.timestamp}`);
  lines.push('---', '', e.details || `${e.signal} ${e.weight}`);
  return lines.join('\n');
}
function parseEvidence(raw: string): TasteEvidence | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const [, yaml] = m;
  const meta: Record<string, string> = {};
  for (const line of yaml.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      try {
        v = JSON.parse(v) as string;
      } catch {
        v = v.slice(1, -1);
      }
    }
    meta[k] = v;
  }
  return {
    id: meta.id || '',
    taskId: meta.task_id || '',
    ruleId: meta.rule_id || undefined,
    signal: (meta.signal as TasteSignal) || 'accept',
    weight: meta.weight ? Number.parseFloat(meta.weight) : 0,
    before: meta.before_text || undefined,
    after: meta.after_text || undefined,
    filePath: meta.file_path || undefined,
    details: meta.details || undefined,
    timestamp: meta.created_at || new Date().toISOString(),
  };
}

function stringifyConflict(c: TasteConflict): string {
  const lines = ['---'];
  lines.push(`id: ${c.id}`);
  lines.push(`rule_id_a: ${c.ruleIdA}`);
  lines.push(`rule_id_b: ${c.ruleIdB}`);
  lines.push(`reason: ${JSON.stringify(c.reason)}`);
  lines.push(`detected_at: ${c.detectedAt}`);
  lines.push(`resolved: ${c.resolved ? 1 : 0}`);
  lines.push('---', '', c.reason);
  return lines.join('\n');
}
function parseConflict(raw: string): TasteConflict | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const [, yaml] = m;
  const meta: Record<string, string> = {};
  for (const line of yaml.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      try {
        v = JSON.parse(v) as string;
      } catch {
        v = v.slice(1, -1);
      }
    }
    meta[k] = v;
  }
  return {
    id: meta.id || '',
    ruleIdA: meta.rule_id_a || '',
    ruleIdB: meta.rule_id_b || '',
    reason: meta.reason || '',
    detectedAt: meta.detected_at || new Date().toISOString(),
    resolved: meta.resolved === '1',
  };
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}

export class FileTasteStore implements TasteStore {
  private customProjectDir?: string;
  private customGlobalDir?: string;
  constructor(options?: { projectDbPath?: string; globalDbPath?: string }) {
    // Accept legacy db path options and derive dir
    if (options?.projectDbPath) this.customProjectDir = options.projectDbPath.replace(/taste\.db$/, '');
    if (options?.globalDbPath) this.customGlobalDir = options.globalDbPath.replace(/taste\.db$/, '');
  }
  private getProjDir(): string {
    return this.customProjectDir || getProjectTasteDir();
  }
  private getGlobDir(): string {
    return this.customGlobalDir || getGlobalTasteDir();
  }
  private getProjRulesDir(): string {
    return join(this.getProjDir(), 'rules');
  }
  private getGlobRulesDir(): string {
    return join(this.getGlobDir(), 'rules');
  }
  private getEvDir(): string {
    return join(this.getProjDir(), 'evidence');
  }
  private getCfDir(): string {
    return join(this.getProjDir(), 'conflicts');
  }

  private readRuleFile(path: string): TasteRule | null {
    try {
      return parseRule(readFileSync(path, 'utf8'));
    } catch {
      return null;
    }
  }

  async get(id: string): Promise<TasteRule | null> {
    const projPath = join(this.getProjRulesDir(), `${sanitizeId(id)}.md`);
    if (existsSync(projPath)) {
      const r = this.readRuleFile(projPath);
      if (r) return r;
    }
    const globPath = join(this.getGlobRulesDir(), `${sanitizeId(id)}.md`);
    if (existsSync(globPath)) {
      const r = this.readRuleFile(globPath);
      if (r) return r;
    }
    return null;
  }

  async list(query?: TasteQuery): Promise<TasteRule[]> {
    const map = new Map<string, TasteRule>();
    const collect = (dir: string) => {
      for (const f of listFiles(dir)) {
        const r = this.readRuleFile(join(dir, f));
        if (!r) continue;
        if (query?.category && r.category !== query.category) continue;
        if (query?.status) {
          const statuses = Array.isArray(query.status) ? query.status : [query.status];
          if (statuses.length > 0 && !statuses.includes(r.status)) continue;
        }
        if (query?.minConfidence !== undefined && r.confidence < query.minConfidence) continue;
        if (query?.language && r.scope.language && r.scope.language !== query.language) {
          // if rule has language and doesn't match, skip; null language = universal
          continue;
        }
        map.set(r.id, r);
      }
    };
    if (!query?.scopeType || query.scopeType === 'global') collect(this.getGlobRulesDir());
    if (!query?.scopeType || query.scopeType === 'project') collect(this.getProjRulesDir());
    let results = Array.from(map.values());
    if (query?.search) {
      const needle = query.search.toLowerCase();
      results = results.filter(r => r.rule.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle));
    }
    results.sort((a, b) => b.confidence - a.confidence || b.updatedAt.localeCompare(a.updatedAt));
    if (query?.limit && query.limit > 0) results = results.slice(0, query.limit);
    return results;
  }

  async upsert(rule: TasteRule): Promise<void> {
    const dir = rule.scope.type === 'global' ? this.getGlobRulesDir() : this.getProjRulesDir();
    ensureDir(dir);
    const path = join(dir, `${sanitizeId(rule.id)}.md`);
    let existing: TasteRule | null = null;
    if (existsSync(path)) existing = this.readRuleFile(path);
    const now = new Date().toISOString();
    const toWrite: TasteRule = {
      ...rule,
      createdAt: existing?.createdAt ?? rule.createdAt ?? now,
      updatedAt: now,
      lastObservedAt: rule.lastObservedAt ?? now,
    };
    // atomic write
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, stringifyRule(toWrite), 'utf8');
    try {
      const { renameSync } = await import('node:fs');
      renameSync(tmp, path);
    } catch {
      writeFileSync(path, stringifyRule(toWrite), 'utf8');
      try {
        unlinkSync(tmp);
      } catch {
        /* best-effort: auxiliary failure must not affect the primary flow */
      }
    }
  }

  async disable(id: string): Promise<boolean> {
    let changed = false;
    for (const dir of [this.getProjRulesDir(), this.getGlobRulesDir()]) {
      const p = join(dir, `${sanitizeId(id)}.md`);
      if (!existsSync(p)) continue;
      const r = this.readRuleFile(p);
      if (!r) continue;
      r.status = 'disabled';
      r.updatedAt = new Date().toISOString();
      writeFileSync(p, stringifyRule(r), 'utf8');
      changed = true;
    }
    return changed;
  }
  async enable(id: string): Promise<boolean> {
    let changed = false;
    for (const dir of [this.getProjRulesDir(), this.getGlobRulesDir()]) {
      const p = join(dir, `${sanitizeId(id)}.md`);
      if (!existsSync(p)) continue;
      const r = this.readRuleFile(p);
      if (!r) continue;
      r.status = 'active';
      r.updatedAt = new Date().toISOString();
      writeFileSync(p, stringifyRule(r), 'utf8');
      changed = true;
    }
    return changed;
  }
  async remove(id: string): Promise<boolean> {
    let deleted = false;
    for (const dir of [this.getProjRulesDir(), this.getGlobRulesDir()]) {
      const p = join(dir, `${sanitizeId(id)}.md`);
      if (existsSync(p)) {
        try {
          unlinkSync(p);
          deleted = true;
        } catch {
          /* best-effort: auxiliary failure must not affect the primary flow */
        }
      }
    }
    return deleted;
  }
  async clear(scopeType?: 'global' | 'project'): Promise<void> {
    const clearDir = (dir: string) => {
      for (const f of listFiles(dir))
        try {
          unlinkSync(join(dir, f));
        } catch {
          /* best-effort: auxiliary failure must not affect the primary flow */
        }
    };
    if (!scopeType || scopeType === 'project') {
      clearDir(this.getProjRulesDir());
      clearDir(this.getEvDir());
      clearDir(this.getCfDir());
    }
    if (!scopeType || scopeType === 'global') clearDir(this.getGlobRulesDir());
  }

  async addEvidence(evidence: TasteEvidence): Promise<void> {
    ensureDir(this.getEvDir());
    const p = join(this.getEvDir(), `${sanitizeId(evidence.id)}.md`);
    writeFileSync(p, stringifyEvidence(evidence), 'utf8');
  }
  async getEvidenceForRule(ruleId: string): Promise<TasteEvidence[]> {
    const all = await this.getRecentEvidence(1000);
    return all.filter(e => e.ruleId === ruleId);
  }
  async getRecentEvidence(limit = 20): Promise<TasteEvidence[]> {
    const files = listFiles(this.getEvDir());
    const rows: TasteEvidence[] = [];
    for (const f of files) {
      try {
        const e = parseEvidence(readFileSync(join(this.getEvDir(), f), 'utf8'));
        if (e) rows.push(e);
      } catch {
        /* best-effort: auxiliary failure must not affect the primary flow */
      }
    }
    rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return rows.slice(0, limit);
  }

  async addConflict(conflict: TasteConflict): Promise<void> {
    ensureDir(this.getCfDir());
    const p = join(this.getCfDir(), `${sanitizeId(conflict.id)}.md`);
    writeFileSync(p, stringifyConflict(conflict), 'utf8');
  }
  async getConflicts(unresolvedOnly = true): Promise<TasteConflict[]> {
    const files = listFiles(this.getCfDir());
    const rows: TasteConflict[] = [];
    for (const f of files) {
      try {
        const c = parseConflict(readFileSync(join(this.getCfDir(), f), 'utf8'));
        if (c) rows.push(c);
      } catch {
        /* best-effort: auxiliary failure must not affect the primary flow */
      }
    }
    rows.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
    return unresolvedOnly ? rows.filter(r => !r.resolved) : rows;
  }
  async resolveConflict(conflictId: string): Promise<boolean> {
    const p = join(this.getCfDir(), `${sanitizeId(conflictId)}.md`);
    if (!existsSync(p)) return false;
    const c = parseConflict(readFileSync(p, 'utf8'));
    if (!c) return false;
    c.resolved = true;
    writeFileSync(p, stringifyConflict(c), 'utf8');
    return true;
  }
  close(): void {
    /* filesystem-backed store has no open resources */
  }
}
