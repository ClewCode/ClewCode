// Clew taste: Non-interactive handlers for /taste subcommands

import type { TasteRuntime } from '../../services/taste/core/TasteRuntime.js';
import { TasteEvaluator } from '../../services/taste/eval/TasteEvaluator.js';

export async function handleNonInteractive(args: string, runtime: TasteRuntime): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? 'status';

  switch (cmd) {
    case 'status':
      return handleStatus(runtime);

    case 'init': {
      await runtime.initialize();
      const existingRules = runtime.getRules();

      // If no rules yet, try AI-driven codebase analysis
      if (existingRules.length === 0) {
        const { TasteCodebaseAnalyzer } = await import('../../services/taste/auto-learn/TasteCodebaseAnalyzer.js');
        const analyzer = new TasteCodebaseAnalyzer();
        const context = analyzer.collectContext();

        // Quick check: if no codebase context found, skip AI analysis
        if (context.gitLog || Object.keys(context.configFiles).length > 0 || context.projectFiles.length > 0) {
          const analysis = await analyzer.analyzeWithAI(context);

          if (analysis.rules.length > 0) {
            let added = 0;
            for (const r of analysis.rules) {
              runtime.addRule(r.text, r.kind, 'inferred', ['ai-detected']);
              added++;
            }
            await runtime.saveProfile();
            return [
              `Taste initialized \u2014 ${added} rule${added === 1 ? '' : 's'} added from codebase analysis.`,
              '',
              ...analysis.rules.map(r => `  [${r.kind}] ${r.text} (confidence: ${(r.confidence * 100).toFixed(0)}%)`),
            ].join('\n');
          }
        }
      }

      return `Taste initialized \u2014 ${existingRules.length} rule${existingRules.length === 1 ? '' : 's'} found.`;
    }

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

    case 'suggest': {
      const sub = parts[1]?.toLowerCase();
      if (sub === 'accept') {
        const id = parts[2];
        if (!id) return 'Usage: /taste suggest accept <suggestion-id>';
        const rule = runtime.getAutoLearn().acceptSuggestion(id, (text, kind, source, tags) =>
          runtime.addRule(text, kind, source, tags),
        );
        if (!rule) return `Suggestion not found: ${id}`;
        await runtime.saveProfile();
        return `Accepted suggestion: "${rule.text}" (confidence: ${(rule.confidence * 100).toFixed(0)}%)`;
      }
      if (sub === 'reject') {
        const id = parts[2];
        if (!id) return 'Usage: /taste suggest reject <suggestion-id>';
        runtime.getAutoLearn().rejectSuggestion(id);
        return `Rejected suggestion: ${id}`;
      }
      // Run detection
      const suggestions = runtime.processAutoLearn();
      const pending = runtime.getAutoLearn().getPendingSuggestions();
      if (pending.length === 0 && suggestions.length === 0) {
        return 'No suggestions available yet. Keep using Clew to generate more signals.';
      }
      const lines: string[] = ['Auto-learn suggestions:'];
      if (suggestions.length > 0) {
        lines.push(`\n${suggestions.length} new pattern${suggestions.length === 1 ? '' : 's'} detected!\n`);
      }
      for (const s of pending) {
        lines.push(
          `  [${s.id.slice(0, 8)}] ${s.pattern.text}`,
          `       kind: ${s.pattern.kind}, confidence: ${(s.pattern.confidence * 100).toFixed(0)}%, seen ${s.pattern.frequency}x`,
          `       /taste suggest accept ${s.id.slice(0, 8)}  or  /taste suggest reject ${s.id.slice(0, 8)}`,
        );
      }
      return lines.join('\n');
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
