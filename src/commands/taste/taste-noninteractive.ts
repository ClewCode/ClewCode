// Clew taste: Non-interactive handlers for /taste subcommands

import type { TasteRuntime } from '../../services/taste/core/TasteRuntime.js';
import { TasteEvaluator } from '../../services/taste/eval/TasteEvaluator.js';

export async function handleNonInteractive(args: string, runtime: TasteRuntime): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? 'status';

  switch (cmd) {
    case 'status':
      return handleStatus(runtime);

    case 'learn': {
      const ruleText = parts.slice(1).join(' ');
      if (!ruleText) return 'Usage: /taste learn <rule text>';
      const rule = runtime.addRule(ruleText);
      await runtime.saveProfile();
      return `Learned rule: "${rule.text}" (id: ${rule.id}, confidence: ${rule.confidence})`;
    }

    case 'forget': {
      const id = parts[1];
      if (!id) return 'Usage: /taste forget <rule-id>';
      const removed = runtime.removeRule(id);
      if (!removed) return `Rule not found: ${id}`;
      await runtime.saveProfile();
      return `Forgot rule: ${id}`;
    }

    case 'profile': {
      const profile = runtime.getProfile();
      const rules = runtime.getRules();
      const lines: string[] = [
        `Taste profile: ${profile.projectId}`,
        `Version: ${profile.version}`,
        `Rules: ${rules.length}`,
        `Events: ${profile.stats.totalEvents}`,
        `Last updated: ${profile.stats.lastUpdatedAt}`,
        '',
        'Rules:',
      ];
      for (const rule of rules.slice(0, 20)) {
        lines.push(
          `  [${rule.id.slice(0, 8)}] ${rule.text} (kind: ${rule.kind}, confidence: ${rule.confidence.toFixed(2)}, source: ${rule.source})`,
        );
      }
      if (rules.length > 20) lines.push(`  ... and ${rules.length - 20} more`);
      return lines.join('\n');
    }

    case 'events': {
      const events = runtime.getEventLog().getRecentEvents(20);
      if (events.length === 0) return 'No events recorded yet.';
      const lines = events.map(
        e =>
          `${e.timestamp.slice(0, 19)} [${e.type}] reward=${e.reward.toFixed(2)}${e.prompt ? ` "${e.prompt.slice(0, 60)}"` : ''}${e.filePaths?.length ? ` files=${e.filePaths.length}` : ''}`,
      );
      return `Recent events (${events.length}):\n${lines.join('\n')}`;
    }

    case 'decay': {
      const count = await runtime.applyDecay();
      return `Decay applied: ${count} rules affected.`;
    }

    case 'eval': {
      const profile = runtime.getProfile();
      const evaluator = new TasteEvaluator();
      const result = evaluator.evaluate(profile);
      const lines: string[] = [
        result.summary,
        `Neural score: ${result.neuralScore.toFixed(3)}`,
        `Symbolic checks: ${result.symbolicChecks.filter(c => c.passed).length}/${result.symbolicChecks.length} passed`,
      ];
      return lines.join('\n');
    }

    case 'export': {
      const profile = runtime.getProfile();
      const { exportPackage, getProjectPackagesDir } = await import(
        '../../services/taste/storage/TastePackageStore.js'
      );
      const filePath = await exportPackage(
        profile,
        `taste-export-${Date.now()}`,
        'Exported taste profile',
        getProjectPackagesDir(process.cwd()),
      );
      return `Exported to: ${filePath} (${profile.rules.length} rules)`;
    }

    case 'import': {
      const filePath = parts[1];
      if (!filePath) return 'Usage: /taste import <file-path>';
      const { importPackage, mergePackageIntoProfile } = await import(
        '../../services/taste/storage/TastePackageStore.js'
      );
      const pkg = await importPackage(filePath);
      if (!pkg) return `Failed to import: ${filePath}`;
      const profile = runtime.getProfile();
      const updated = await mergePackageIntoProfile(pkg, profile, 'imported');
      runtime.getRules(); // refresh cache
      await runtime.saveProfile();
      return `Imported: ${pkg.name} (${pkg.rules.length} rules, profile now has ${updated.rules.length} rules)`;
    }

    default: {
      return handleStatus(runtime);
    }
  }
}

function handleStatus(runtime: TasteRuntime): string {
  const config = runtime.getConfig();
  const profile = runtime.getProfile();
  const rules = runtime.getRules();
  const arm = runtime.getCurrentArm();

  return [
    `Clew taste: ${config.enabled ? 'ENABLED' : 'DISABLED'}`,
    `Profile: ${profile.projectId} (${rules.length} rules)`,
    `Events: ${profile.stats.totalEvents} (${profile.stats.totalAccepts} accepts, ${profile.stats.totalRejects} rejects, ${profile.stats.totalEdits} edits)`,
    `Bandit arm: ${arm}`,
    `Prompt injection: ${config.injectPrompts ? 'on' : 'off'}`,
    `Auto-learn: ${config.autoLearn ? 'on' : 'off'}`,
    `Decay: ${config.decayEnabled ? 'on' : 'off'}`,
    `Min confidence: ${config.minConfidence}`,
  ].join('\n');
}
