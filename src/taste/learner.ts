/**
 * Taste Learner — Signal → Evidence → Rule
 *
 * Promotion:
 *   explicit → active immediately (confidence 1.0)
 *   behavioral ≥2 → weak (0.65)
 *   behavioral ≥3 && noConflict → active (0.80)
 *   outcome only reinforces existing, never creates
 *
 * Confidence: positive / total with outcome weight 0.2
 * States: candidate → weak → active → conflicted → disabled (deprecated)
 */

import { countRecent, decayConfidence, shouldPromoteToActive, shouldPromoteToWeak } from './aggregator.js';
import type { SignalKind } from './signal.js';
import { getTasteStore } from './store/taste-store.js';
import type { TasteCategory, TasteRule } from './types.js';

function normalizeRule(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, ' ')
    .trim()
    .slice(0, 120);
}

function findSimilarRule(rules: TasteRule[], normalized: string): TasteRule | null {
  for (const r of rules) {
    const n = normalizeRule(r.rule);
    if (n === normalized) return r;
    // Jaccard on words
    const a = new Set(normalized.split(' ').filter(w => w.length > 2));
    const b = new Set(n.split(' ').filter(w => w.length > 2));
    if (a.size === 0 || b.size === 0) continue;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    const union = a.size + b.size - inter;
    const jaccard = inter / union;
    if (jaccard > 0.6) return r;
  }
  return null;
}

function detectConflict(newRule: string, existing: TasteRule[]): TasteRule | null {
  const t = newRule.toLowerCase();
  // Simple opposite detection: one says "prefer minimal diffs" other "prefer broad refactors"
  for (const r of existing) {
    const e = r.rule.toLowerCase();
    const opposites: Array<[string, string]> = [
      ['minimal', 'broad'],
      ['concise', 'verbose'],
      ['composition', 'inheritance'],
      ['small', 'large'],
    ];
    for (const [a, b] of opposites) {
      if ((t.includes(a) && e.includes(b)) || (t.includes(b) && e.includes(a))) {
        if (r.status === 'active' || r.status === 'weak') return r;
      }
    }
  }
  return null;
}

export type LearnResult = {
  rule: TasteRule | null;
  action: 'created' | 'reinforced' | 'promoted' | 'conflicted' | 'outcome_ignored' | 'no_match';
  evidenceCount: number;
};

export async function learnFromSignal(opts: {
  kind: SignalKind;
  ruleText?: string;
  taskId: string;
  category?: TasteCategory;
  details?: string;
}): Promise<LearnResult> {
  const store = getTasteStore();
  const now = new Date().toISOString();

  // Outcome without ruleText only reinforces — never creates
  if (opts.kind === 'outcome' && !opts.ruleText) {
    return { rule: null, action: 'outcome_ignored', evidenceCount: 0 };
  }

  const ruleText = (opts.ruleText || '').trim();
  if (!ruleText) return { rule: null, action: 'no_match', evidenceCount: 0 };

  const normalized = normalizeRule(ruleText);
  const allRules = await store.list();
  const existing = findSimilarRule(allRules, normalized);

  // Conflict check before promotion
  const conflicting = detectConflict(
    ruleText,
    allRules.filter(r => r.id !== existing?.id),
  );

  if (existing) {
    const weight = opts.kind === 'explicit' ? 1.0 : opts.kind === 'behavioral' ? 0.6 : 0.2;
    const isPositive = opts.kind !== 'outcome' || true;
    existing.evidenceCount += 1;
    if (isPositive) existing.positiveEvidence += 1;
    else existing.negativeEvidence += 1;

    const total = existing.evidenceCount;
    const pos = existing.positiveEvidence;
    if (opts.kind === 'outcome') {
      existing.confidence = Math.min(1, existing.confidence + 0.05);
    } else {
      existing.confidence = Math.min(1, 0.4 + (pos / Math.max(1, total)) * 0.6 + 0.05);
    }
    // Decay check based on last observed
    existing.confidence = decayConfidence(existing.confidence, existing.lastObservedAt);
    existing.lastObservedAt = now;
    existing.updatedAt = now;

    // Cross-session windowed promotion: count recent evidence (7d)
    const priorEvidence = await store.getEvidenceForRule(existing.id);
    const recentCount = countRecent(priorEvidence, Date.now()) + 1; // + current

    let action: LearnResult['action'] = 'reinforced';
    if (conflicting && existing.status !== 'conflicted') {
      existing.status = 'conflicted';
      action = 'conflicted';
      await store.addConflict({
        id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ruleIdA: existing.id,
        ruleIdB: conflicting.id,
        reason: `Conflict: "${ruleText}" vs "${conflicting.rule}"`,
        detectedAt: now,
        resolved: false,
      });
    } else if (shouldPromoteToWeak(recentCount, existing.status)) {
      existing.status = 'weak';
      existing.confidence = Math.max(existing.confidence, 0.65);
      action = 'promoted';
    } else if (shouldPromoteToActive(recentCount, existing.status, !!conflicting)) {
      existing.status = 'active';
      existing.confidence = Math.max(existing.confidence, 0.8);
      action = 'promoted';
    } else if (opts.kind === 'explicit') {
      existing.status = 'active';
      existing.confidence = 1.0;
      action = 'promoted';
    }

    await store.upsert(existing);
    // Record evidence
    await store.addEvidence({
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taskId: opts.taskId,
      ruleId: existing.id,
      signal: opts.kind === 'explicit' ? 'accept' : opts.kind === 'behavioral' ? 'edit' : 'test_pass',
      weight: weight,
      details: opts.details || ruleText.slice(0, 200),
      timestamp: now,
    });

    return { rule: existing, action, evidenceCount: existing.evidenceCount };
  }

  // New rule creation
  if (opts.kind === 'outcome') {
    return { rule: null, action: 'outcome_ignored', evidenceCount: 0 };
  }

  const category = (opts.category as TasteCategory) || 'coding';
  const newRule: TasteRule = {
    id: `taste.${category}.${normalized.replace(/\s+/g, '-').slice(0, 30) || Date.now()}`,
    rule: ruleText,
    category,
    scope: { type: 'project' },
    confidence: opts.kind === 'explicit' ? 1.0 : 0.45,
    status: opts.kind === 'explicit' ? 'active' : 'candidate',
    source: opts.kind === 'explicit' ? 'explicit' : 'learned',
    evidenceCount: 1,
    positiveEvidence: 1,
    negativeEvidence: 0,
    createdAt: now,
    updatedAt: now,
    lastObservedAt: now,
  };

  // Detect conflict on creation
  if (conflicting) {
    newRule.status = 'conflicted';
    await store.upsert(newRule);
    await store.addConflict({
      id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ruleIdA: newRule.id,
      ruleIdB: conflicting.id,
      reason: `Conflict: "${ruleText}" vs "${conflicting.rule}"`,
      detectedAt: now,
      resolved: false,
    });
    await store.addEvidence({
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      taskId: opts.taskId,
      ruleId: newRule.id,
      signal: 'accept',
      weight: 1.0,
      details: ruleText.slice(0, 200),
      timestamp: now,
    });
    return { rule: newRule, action: 'conflicted', evidenceCount: 1 };
  }

  await store.upsert(newRule);
  await store.addEvidence({
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    taskId: opts.taskId,
    ruleId: newRule.id,
    signal: opts.kind === 'explicit' ? 'accept' : 'edit',
    weight: opts.kind === 'explicit' ? 1.0 : 0.6,
    details: ruleText.slice(0, 200),
    timestamp: now,
  });

  return { rule: newRule, action: 'created', evidenceCount: 1 };
}
