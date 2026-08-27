/**
 * `/taste` slash command — inspect, add, disable, and manage user & project Taste preferences.
 */

import { getTasteStore } from '../../taste/store/taste-store.js';
import type { TasteCategory, TasteRule } from '../../taste/types.js';
import type { CommandContext } from '../../types/command.js';

export default async function tasteHandler(args: string, context: CommandContext): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const subCommand = parts[0]?.toLowerCase();
  const rest = parts.slice(1).join(' ').trim();
  const store = getTasteStore();

  if (!subCommand || subCommand === 'list' || subCommand === 'status') {
    const rules = await store.list();
    if (rules.length === 0) {
      context.log('No taste preferences recorded yet. Use `/taste add <rule>` to add one.');
      return;
    }

    const lines: string[] = ['=== Taste Preferences ===\n'];
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i]!;
      const scopeTag = r.scope.type === 'global' ? '[global]' : '[project]';
      const statusTag =
        r.status === 'active' ? '✓' : r.status === 'disabled' ? '✗' : r.status === 'candidate' ? '?' : '○';
      const conf = Math.round(r.confidence * 100);
      lines.push(
        `${statusTag} #${i + 1} (${r.id}) ${scopeTag} [${r.category}] [status: ${r.status}] [conf: ${conf}%]:`,
      );
      lines.push(`   "${r.rule}"\n`);
    }
    context.log(lines.join('\n'));
    return;
  }

  if (subCommand === 'add' || subCommand === 'remember') {
    if (!rest) {
      context.log('Usage: /taste add [--global] [--category <cat>] <rule text>');
      return;
    }

    let isGlobal = false;
    const category: TasteCategory = 'coding';
    let ruleText = rest;

    if (ruleText.startsWith('--global ')) {
      isGlobal = true;
      ruleText = ruleText.replace('--global ', '').trim();
    }

    const slug = ruleText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30)
      .replace(/^-|-$/g, '');
    const id = `${category}.${slug || Date.now()}`;
    const now = new Date().toISOString();

    const newRule: TasteRule = {
      id,
      rule: ruleText,
      category,
      scope: {
        type: isGlobal ? 'global' : 'project',
      },
      confidence: 1.0,
      status: 'active',
      source: 'explicit',
      evidenceCount: 1,
      positiveEvidence: 1,
      negativeEvidence: 0,
      createdAt: now,
      updatedAt: now,
      lastObservedAt: now,
    };

    await store.upsert(newRule);
    context.log(`✓ Added ${isGlobal ? 'global' : 'project'} taste preference: "${ruleText}" (id: ${id})`);
    return;
  }

  if (subCommand === 'evidence') {
    if (!rest) {
      context.log('Usage: /taste evidence <id|#num>');
      return;
    }
    const all = await store.list();
    const idx = parseInt(rest, 10);
    const targetId = !Number.isNaN(idx) && idx > 0 && idx <= all.length ? all[idx - 1]!.id : rest;

    const evidenceList = await store.getEvidenceForRule(targetId);
    if (evidenceList.length === 0) {
      context.log(`No recorded evidence found for rule: ${targetId}`);
      return;
    }

    const lines: string[] = [`=== Evidence Trail for ${targetId} (${evidenceList.length} items) ===\n`];
    for (const ev of evidenceList) {
      const sign = ev.weight >= 0 ? `+${ev.weight.toFixed(2)}` : ev.weight.toFixed(2);
      lines.push(`• [${sign}] signal=${ev.signal} task=${ev.taskId} (${ev.timestamp.slice(0, 19).replace('T', ' ')})`);
      if (ev.details) lines.push(`  ↳ ${ev.details}`);
    }
    context.log(lines.join('\n'));
    return;
  }

  if (subCommand === 'conflicts') {
    const conflicts = await store.getConflicts(true);
    if (conflicts.length === 0) {
      context.log('✓ No active taste rule conflicts detected.');
      return;
    }

    const lines: string[] = [`=== Detected Taste Conflicts (${conflicts.length}) ===\n`];
    for (const c of conflicts) {
      lines.push(`⚠️ Conflict between "${c.ruleIdA}" and "${c.ruleIdB}":`);
      lines.push(`   Reason: ${c.reason}\n`);
    }
    context.log(lines.join('\n'));
    return;
  }

  if (subCommand === 'remove' || subCommand === 'forget' || subCommand === 'delete') {
    if (!rest) {
      context.log('Usage: /taste remove <id|#num>');
      return;
    }
    const all = await store.list();
    const idx = parseInt(rest, 10);
    const targetId = !Number.isNaN(idx) && idx > 0 && idx <= all.length ? all[idx - 1]!.id : rest;

    const removed = await store.remove(targetId);
    if (removed) {
      context.log(`✓ Removed taste rule: ${targetId}`);
    } else {
      context.log(`No taste rule found with id: ${targetId}`);
    }
    return;
  }

  if (subCommand === 'disable') {
    if (!rest) {
      context.log('Usage: /taste disable <id|#num>');
      return;
    }
    const all = await store.list();
    const idx = parseInt(rest, 10);
    const targetId = !Number.isNaN(idx) && idx > 0 && idx <= all.length ? all[idx - 1]!.id : rest;

    const disabled = await store.disable(targetId);
    if (disabled) {
      context.log(`✓ Disabled taste rule: ${targetId}`);
    } else {
      context.log(`No taste rule found with id: ${targetId}`);
    }
    return;
  }

  if (subCommand === 'enable') {
    if (!rest) {
      context.log('Usage: /taste enable <id|#num>');
      return;
    }
    const all = await store.list();
    const idx = parseInt(rest, 10);
    const targetId = !Number.isNaN(idx) && idx > 0 && idx <= all.length ? all[idx - 1]!.id : rest;

    const enabled = await store.enable(targetId);
    if (enabled) {
      context.log(`✓ Enabled taste rule: ${targetId}`);
    } else {
      context.log(`No taste rule found with id: ${targetId}`);
    }
    return;
  }

  if (subCommand === 'inspect' || subCommand === 'show') {
    if (!rest) {
      context.log('Usage: /taste inspect <id|#num>');
      return;
    }
    const all = await store.list();
    const idx = parseInt(rest, 10);
    const targetId = !Number.isNaN(idx) && idx > 0 && idx <= all.length ? all[idx - 1]!.id : rest;

    const rule = await store.get(targetId);
    if (!rule) {
      context.log(`No taste rule found with id: ${targetId}`);
      return;
    }

    context.log(`
=== Taste Rule Inspection ===
ID: ${rule.id}
Rule: "${rule.rule}"
Category: ${rule.category}
Scope: ${rule.scope.type} ${rule.scope.language ? `(language: ${rule.scope.language})` : ''}
Confidence: ${Math.round(rule.confidence * 100)}%
Status: ${rule.status}
Source: ${rule.source}
Evidence Count: ${rule.evidenceCount} (Positive: ${rule.positiveEvidence}, Negative: ${rule.negativeEvidence})
Created: ${rule.createdAt}
Updated: ${rule.updatedAt}
Last Observed: ${rule.lastObservedAt}
`);
    return;
  }

  if (subCommand === 'clear' || subCommand === 'reset') {
    await store.clear('project');
    context.log('✓ Cleared all project taste preferences.');
    return;
  }

  context.log(`Unknown /taste command: "${subCommand}".
Available commands:
  /taste [list]                      — List all preferences
  /taste add [--global] <rule>       — Add a new preference
  /taste evidence <id|#num>          — View recorded evidence trail
  /taste conflicts                   — Check for contradictory preferences
  /taste inspect <id|#num>           — View detailed metrics
  /taste disable <id|#num>           — Temporarily disable a preference
  /taste enable <id|#num>            — Re-enable a preference
  /taste remove <id|#num>            — Permanently remove a preference
  /taste clear                       — Clear all project preferences
`);
}
