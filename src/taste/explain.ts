/**
 * Explainability — /taste why
 */

import { getTasteStore } from './store/taste-store.js';

export async function explainRule(idOrIndex: string): Promise<string> {
  const store = getTasteStore();
  const all = await store.list();
  let id = idOrIndex;
  const idx = parseInt(idOrIndex, 10);
  if (!Number.isNaN(idx) && idx > 0 && idx <= all.length) id = all[idx - 1]!.id;

  const rule = await store.get(id);
  if (!rule) return `No taste rule found: ${idOrIndex}`;

  const evidence = await store.getEvidenceForRule(rule.id);
  const recent = evidence.slice(0, 5);

  const lines: string[] = [];
  lines.push(`=== Why: "${rule.rule}" ===`);
  lines.push('');
  lines.push(`id: ${rule.id}`);
  lines.push(`category: ${rule.category} | scope: ${rule.scope.type} | source: ${rule.source}`);
  lines.push(`status: ${rule.status} | confidence: ${(rule.confidence * 100).toFixed(0)}%`);
  lines.push(
    `evidence: ${rule.evidenceCount} (positive: ${rule.positiveEvidence}, negative: ${rule.negativeEvidence})`,
  );
  lines.push(`created: ${rule.createdAt.slice(0, 19).replace('T', ' ')}`);
  lines.push(`last reinforced: ${rule.lastObservedAt.slice(0, 19).replace('T', ' ')}`);
  lines.push('');
  if (recent.length === 0) {
    lines.push('evidence: (none yet — explicit rule)');
  } else {
    lines.push(`evidence (${evidence.length} total, showing ${recent.length}):`);
    for (const ev of recent) {
      lines.push(
        `  • [${ev.weight.toFixed(1)}] ${ev.signal} ${ev.timestamp.slice(0, 19).replace('T', ' ')} task=${ev.taskId}`,
      );
      if (ev.details) lines.push(`    ↳ ${ev.details}`);
    }
  }
  if (rule.status === 'conflicted') {
    const conflicts = await store.getConflicts(false);
    const related = conflicts.filter(c => c.ruleIdA === rule.id || c.ruleIdB === rule.id);
    if (related.length > 0) {
      lines.push('');
      lines.push('conflicts:');
      for (const c of related) lines.push(`  ⚠️ ${c.reason} (${c.detectedAt.slice(0, 10)}) resolved=${c.resolved}`);
    }
  }
  return lines.join('\n');
}

export async function explainAll(): Promise<string> {
  const store = getTasteStore();
  const rules = await store.list();
  if (rules.length === 0)
    return 'No taste rules to explain. Add with /taste add or let auto-learning collect evidence.';
  const lines: string[] = [`=== Taste Explainability (${rules.length} rules) ===`, ''];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!;
    lines.push(
      `${i + 1}. "${r.rule}" [${r.status} ${(r.confidence * 100).toFixed(0)}%] — ${r.evidenceCount} evidence, last ${r.lastObservedAt.slice(0, 10)}`,
    );
  }
  lines.push('', 'Use /taste why <id|#num> for detail');
  return lines.join('\n');
}
