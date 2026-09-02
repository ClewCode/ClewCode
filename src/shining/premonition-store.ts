import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { getCwd } from '../utils/cwd.js';
import type { Premonition } from './types.js';

function getShiningDir(): string {
  try {
    return join(getCwd(), DOT_CLEW, 'shining');
  } catch {
    return join(process.cwd(), DOT_CLEW, 'shining');
  }
}
function getPremonitionsDir(): string {
  return join(getShiningDir(), 'premonitions');
}
function ensureDir(): void {
  const d = getPremonitionsDir();
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function filePath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return join(getPremonitionsDir(), `${safe}.md`);
}

function stringify(p: Premonition): string {
  const lines = ['---'];
  lines.push(`id: ${p.id}`);
  lines.push(`kind: ${p.kind}`);
  lines.push(`prediction: ${JSON.stringify(p.prediction)}`);
  lines.push(`confidence: ${p.confidence}`);
  lines.push(`evidence: ${JSON.stringify(p.evidence)}`);
  if (p.suggestedContext?.length) lines.push(`suggested_context: ${JSON.stringify(p.suggestedContext)}`);
  if (p.expiresAt) lines.push(`expires_at: ${p.expiresAt}`);
  lines.push(`created_at: ${p.createdAt}`);
  lines.push('---');
  return lines.join('\n');
}

function parse(raw: string): Premonition | null {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const yaml = m[1];
  const meta: Record<string, string> = {};
  for (const line of yaml.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    const v = line.slice(idx + 1).trim();
    meta[k] = v;
  }
  try {
    const evidence = meta.evidence ? JSON.parse(meta.evidence) : [];
    const suggestedContext = meta.suggested_context ? JSON.parse(meta.suggested_context) : undefined;
    const confidence = meta.confidence ? Number.parseFloat(meta.confidence) : 0.5;
    const expiresAt = meta.expires_at ? Number.parseInt(meta.expires_at, 10) : undefined;
    const createdAt = meta.created_at ? Number.parseInt(meta.created_at, 10) : Date.now();
    const kind = (meta.kind as any) || 'next_intent';
    const prediction = meta.prediction ? JSON.parse(meta.prediction) : '';
    return {
      id: meta.id || '',
      kind,
      prediction,
      confidence,
      evidence,
      suggestedContext,
      expiresAt,
      createdAt,
    };
  } catch {
    return null;
  }
}

export function save(p: Premonition): void {
  ensureDir();
  const fp = filePath(p.id);
  const tmp = `${fp}.tmp`;
  writeFileSync(tmp, stringify(p), 'utf8');
  try {
    renameSync(tmp, fp);
  } catch {
    writeFileSync(fp, stringify(p), 'utf8');
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

export function list(): Premonition[] {
  const dir = getPremonitionsDir();
  if (!existsSync(dir)) return [];
  const now = Date.now();
  const out: Premonition[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const fp = join(dir, f);
    try {
      const raw = readFileSync(fp, 'utf8');
      const p = parse(raw);
      if (!p) continue;
      if (p.expiresAt && p.expiresAt < now) {
        try {
          unlinkSync(fp);
        } catch {}
        continue;
      }
      out.push(p);
    } catch {}
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

export function clear(): void {
  const dir = getPremonitionsDir();
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    try {
      unlinkSync(join(dir, f));
    } catch {}
  }
}

export function get(id: string): Premonition | undefined {
  const fp = filePath(id);
  if (!existsSync(fp)) return undefined;
  try {
    const raw = readFileSync(fp, 'utf8');
    const p = parse(raw);
    if (!p) return undefined;
    if (p.expiresAt && p.expiresAt < Date.now()) {
      try {
        unlinkSync(fp);
      } catch {}
      return undefined;
    }
    return p;
  } catch {
    return undefined;
  }
}
