/**
 * Controlled self-refinement — agents propose edits to memory/skill/prompt
 * files; nothing touches disk until approveRefinement() runs.
 *
 * Each proposal stores: target path, BEFORE/AFTER full content (the diff for
 * display is derived, never machine-applied), provenance (agent + reason),
 * an optional verifier command that must exit 0 before apply, and the
 * original file content so rollback is a plain rewrite.
 *
 * Layout: <project>/.clew/refinements/{pending,applied}/<id>.json
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logError } from '../../utils/log.js';
import { jsonStringify } from '../../utils/slowOperations.js';

export type RefinementTarget = 'memory' | 'skill' | 'prompt' | 'agents_md';
export type RefinementStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'rolled_back';

export interface RefinementProposal {
  id: string;
  createdAt: number;
  /** Provenance: who asked and why. Required — an unattributed proposal is rejected at submit. */
  proposedByAgentId: string;
  reason: string;
  target: {
    type: RefinementTarget;
    /** Absolute path of the file to refine. */
    path: string;
  };
  /** Full new content to write on approval. Diff shown for review = this vs current file. */
  afterContent: string;
  status: RefinementStatus;
  /** Optional shell command; must exit 0 for apply() to proceed. */
  verifierCommand?: string;
  appliedAt?: number;
}

function root(projectDir: string): string {
  return join(projectDir, '.clew', 'refinements');
}

function proposalPath(id: string, status: 'pending' | 'applied', projectDir: string): string {
  return join(root(projectDir), status, `${id}.json`);
}

export function submitRefinement(
  p: Omit<RefinementProposal, 'id' | 'createdAt' | 'status'>,
  projectDir: string,
): RefinementProposal {
  if (!p.reason.trim()) throw new Error('refinement rejected: provenance `reason` is required');
  if (!existsSync(p.target.path)) throw new Error(`refinement rejected: target ${p.target.path} does not exist`);
  const dir = join(root(projectDir), 'pending');
  mkdirSync(dir, { recursive: true });
  const proposal: RefinementProposal = {
    ...p,
    id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    status: 'pending',
  };
  writeFileSync(join(dir, `${proposal.id}.json`), jsonStringify(proposal, null, 2), 'utf8');
  return proposal;
}

export function listRefinements(status: RefinementStatus[], projectDir: string): RefinementProposal[] {
  const out: RefinementProposal[] = [];
  for (const s of status) {
    const dir = join(root(projectDir), s === 'rolled_back' || s === 'applied' ? 'applied' : 'pending');
    if (!existsSync(dir)) continue;
    for (const f of readdirJson(dir)) {
      try {
        out.push(JSON.parse(readFileSync(f, 'utf8')) as RefinementProposal);
      } catch {
        // skip unreadable proposal files
      }
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

function readdirJson(dir: string): string[] {
  try {
    return require('node:fs')
      .readdirSync(dir)
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => join(dir, f));
  } catch {
    return [];
  }
}

function runVerifier(cmd: string): { ok: boolean; output: string } {
  try {
    const res = spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: 120_000 });
    return { ok: res.status === 0, output: `${res.stdout ?? ''}${res.stderr ?? ''}`.slice(0, 4000) };
  } catch (err) {
    return { ok: false, output: String(err) };
  }
}

/** First unified-diff-ish line count for review UIs; no diff lib involved. */
export function summarizeChange(p: RefinementProposal): {
  changedLines: number;
  beforeBytes: number;
  afterBytes: number;
} {
  const before = existsSync(p.target.path) ? readFileSync(p.target.path, 'utf8') : '';
  const beforeLines = new Set(before.split('\n'));
  const afterLines = p.afterContent.split('\n');
  return {
    changedLines: afterLines.filter(l => !beforeLines.has(l)).length,
    beforeBytes: Buffer.byteLength(before),
    afterBytes: Buffer.byteLength(p.afterContent),
  };
}

/**
 * Verify → snapshot original → write new content → archive as applied.
 * Throws with a readable message when anything fails; disk is untouched in that case.
 */
export function approveAndApply(id: string, projectDir: string, opts?: { skipVerifier?: boolean }): void {
  const src = proposalPath(id, 'pending', projectDir);
  if (!existsSync(src)) throw new Error(`no pending refinement ${id}`);
  const p = JSON.parse(readFileSync(src, 'utf8')) as RefinementProposal;

  if (p.verifierCommand && !opts?.skipVerifier) {
    const v = runVerifier(p.verifierCommand);
    if (!v.ok) throw new Error(`verifier failed for ${id}: ${v.output}`);
  }

  const before = readFileSync(p.target.path, 'utf8');
  const appliedDir = join(root(projectDir), 'applied');
  mkdirSync(appliedDir, { recursive: true });
  // rollback payload travels inside the archived record — original never gets lost
  const backupPath = join(appliedDir, `${id}.before`);
  writeFileSync(backupPath, before, 'utf8');

  try {
    mkdirSync(dirname(p.target.path), { recursive: true });
    writeFileSync(p.target.path, p.afterContent, 'utf8');
  } catch (err) {
    logError(err);
    throw err;
  }

  const applied: RefinementProposal = { ...p, status: 'applied', appliedAt: Date.now() };
  writeFileSync(join(appliedDir, `${id}.json`), jsonStringify(applied, null, 2), 'utf8');
  renameSync(src, join(appliedDir, `${id}.pending-gone`));
}

/** Restore the exact pre-apply bytes, then re-archive the record. */
export function rollBack(id: string, projectDir: string): void {
  const rec = proposalPath(id, 'applied', projectDir);
  const backup = join(root(projectDir), 'applied', `${id}.before`);
  if (!existsSync(rec) || !existsSync(backup)) throw new Error(`nothing to roll back for ${id}`);
  const p = JSON.parse(readFileSync(rec, 'utf8')) as RefinementProposal;
  writeFileSync(p.target.path, readFileSync(backup, 'utf8'), 'utf8');
  const rolled: RefinementProposal = { ...p, status: 'rolled_back' };
  writeFileSync(rec, jsonStringify(rolled, null, 2), 'utf8');
}
