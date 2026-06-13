// Clew taste: Interactive command with Ink UI menu

import { useEffect, useState } from 'react';
import { Spinner } from '../../components/Spinner.js';
import { Box, Text } from '../../ink.js';
import type { TasteRuntime } from '../../services/taste/core/TasteRuntime.js';
import { useAppState } from '../../state/AppState.js';
import { AGENT_COLOR_TO_THEME_COLOR } from '../../tools/AgentTool/agentColorManager.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { getTasteRuntime, initRuntime } from './index.js';

interface LogItem {
  badge: string;
  label: string;
  subLines?: string[];
  status: 'pending' | 'running' | 'done' | 'failed';
}

function TasteInitProgress({
  runtime,
  onDone,
}: {
  runtime: TasteRuntime;
  onDone: (result: string) => void;
}): React.ReactNode {
  const [steps, setSteps] = useState<LogItem[]>([
    { badge: 'SCANNING', label: 'Scanning project structure & history', status: 'pending' },
    { badge: 'ANALYZING', label: 'Extracting codebase context', status: 'pending' },
    { badge: 'AI_DETECT', label: 'Detecting coding preferences with AI', status: 'pending' },
    { badge: 'FINALIZE', label: 'Saving preference rules', status: 'pending' },
  ]);

  const agentColor = useAppState(s => s.standaloneAgentContext?.color);
  const themeColor = agentColor ? AGENT_COLOR_TO_THEME_COLOR[agentColor] : 'purple_FOR_SUBAGENTS_ONLY';

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      const updateStep = (badge: string, update: Partial<LogItem>) => {
        if (cancelled) return;
        setSteps(prev => prev.map(s => (s.badge === badge ? { ...s, ...update } : s)));
      };

      try {
        // Phase 1: SCANNING
        updateStep('SCANNING', { status: 'running' });
        await new Promise(r => setTimeout(r, 600));

        const { TasteCodebaseAnalyzer } = await import('../../services/taste/auto-learn/TasteCodebaseAnalyzer.js');
        const analyzer = new TasteCodebaseAnalyzer();
        const context = analyzer.collectContext();

        const fileCount = context.projectFiles.length;
        if (cancelled) return;
        updateStep('SCANNING', {
          status: 'done',
          subLines: [
            `Found ${fileCount} project file${fileCount === 1 ? '' : 's'}`,
            `Read git log history (${context.gitLog ? 'available' : 'empty'})`,
          ],
        });

        // Phase 2: ANALYZING
        updateStep('ANALYZING', { status: 'running' });
        await new Promise(r => setTimeout(r, 600));

        const configCount = Object.keys(context.configFiles).length;
        if (cancelled) return;
        updateStep('ANALYZING', {
          status: 'done',
          subLines: [
            `Analyzed ${configCount} configuration file${configCount === 1 ? '' : 's'}`,
            `Project ID resolved to: ${runtime.getProfile().projectId || 'default'}`,
          ],
        });

        // Phase 3: AI_DETECT
        updateStep('AI_DETECT', { status: 'running' });
        const existingRules = runtime.getRules();
        const learnedRules: Array<{ text: string; kind: string; confidence: number }> = [];
        let added = 0;
        let resultMessage = '';

        if (existingRules.length === 0) {
          if (context.gitLog || Object.keys(context.configFiles).length > 0 || context.projectFiles.length > 0) {
            await runtime.initialize();
            let analysis = await analyzer.analyzeWithAI(context);
            if (analysis.rules.length === 0) {
              analysis = analyzer.analyzeWithHeuristics(context);
            }

            if (analysis.rules.length > 0) {
              for (const r of analysis.rules) {
                runtime.addRule(r.text, r.kind, 'inferred', ['ai-detected']);
                learnedRules.push({ text: r.text, kind: r.kind, confidence: r.confidence });
                added++;
              }
              await runtime.saveProfile();
              resultMessage = formatTasteLearnedResult({
                added,
                configCount,
                fileCount,
                learnedRules,
                totalRules: runtime.getRules().length,
              });
            } else {
              await runtime.initialize();
              resultMessage = formatTasteLearnedResult({
                added: 0,
                configCount,
                fileCount,
                learnedRules,
                totalRules: runtime.getRules().length,
              });
            }
          } else {
            await runtime.initialize();
            resultMessage = formatTasteLearnedResult({
              added: 0,
              configCount,
              fileCount,
              learnedRules,
              totalRules: runtime.getRules().length,
            });
          }
        } else {
          await runtime.initialize();
          resultMessage = formatTasteLearnedResult({
            added: 0,
            configCount,
            fileCount,
            learnedRules: existingRules.slice(0, 8).map(rule => ({
              text: rule.text,
              kind: rule.kind,
              confidence: rule.confidence,
            })),
            totalRules: existingRules.length,
            reusedExisting: true,
          });
        }

        if (cancelled) return;
        updateStep('AI_DETECT', {
          status: 'done',
          subLines: [
            existingRules.length > 0
              ? 'Skipped AI detection (profile already exists)'
              : `AI detected ${added} preference rule${added === 1 ? '' : 's'}`,
          ],
        });

        // Phase 4: FINALIZE
        updateStep('FINALIZE', { status: 'running' });
        await new Promise(r => setTimeout(r, 500));

        if (cancelled) return;
        const totalRules = runtime.getRules().length;
        updateStep('FINALIZE', {
          status: 'done',
          subLines: ['Profile saved successfully', `Loaded ${totalRules} active rule${totalRules === 1 ? '' : 's'}`],
        });

        runtime.notifyTaste(
          added > 0 ? `learned ${added} coding taste rule${added === 1 ? '' : 's'}` : 'taste learning complete',
          'taste-init',
          'medium',
        );

        await new Promise(r => setTimeout(r, 800));
        if (cancelled) return;
        onDone(resultMessage);
      } catch (err) {
        if (cancelled) return;
        const errMsg = err instanceof Error ? err.message : String(err);
        setSteps(prev => prev.map(s => (s.status === 'running' ? { ...s, status: 'failed', subLines: [errMsg] } : s)));
        await runtime.initialize();
        await new Promise(r => setTimeout(r, 1500));
        if (cancelled) return;
        onDone(`Taste initialized \u2014 with errors: ${errMsg}`);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [runtime, onDone]);

  return (
    <Box flexDirection="column" gap={0} paddingX={1} paddingY={0}>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text color="white" backgroundColor={themeColor} bold>
          {' '}
          TASTE{' '}
        </Text>
        <Text bold>Preference-learning initialization</Text>
      </Box>

      {steps.map((step, idx) => {
        const isLastStep = idx === steps.length - 1;
        const branchChar = isLastStep ? '└──' : '├──';
        const verticalChar = isLastStep ? '   ' : '│  ';

        let statusText = '';
        if (step.status === 'running') {
          statusText = ' (running...)';
        } else if (step.status === 'done') {
          statusText = ' (done)';
        } else if (step.status === 'failed') {
          statusText = ' (failed)';
        } else {
          statusText = ' (queued)';
        }

        const isVisible = step.status !== 'pending' || idx === 0 || steps[idx - 1]?.status === 'done';
        if (!isVisible) return null;

        return (
          <Box flexDirection="column" key={step.badge} marginLeft={0}>
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text dimColor>{branchChar} </Text>
              <Text color="white" backgroundColor={themeColor} bold>
                {' '}
                {step.badge}{' '}
              </Text>
              <Text dimColor={step.status === 'pending'}>{step.label}</Text>
              {step.status === 'running' && <Spinner />}
              <Text dimColor italic>
                {statusText}
              </Text>
            </Box>

            {step.subLines?.map((sub, sIdx) => {
              const isLastSub = sIdx === step.subLines!.length - 1;
              const subBranch = isLastSub ? '└──' : '├──';
              return (
                <Box flexDirection="row" gap={1} key={sub} marginLeft={0}>
                  <Text dimColor>
                    {verticalChar} {subBranch}{' '}
                  </Text>
                  <Text dimColor>{sub}</Text>
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

function formatTasteLearnedResult({
  added,
  configCount,
  fileCount,
  learnedRules,
  totalRules,
  reusedExisting,
}: {
  added: number;
  configCount: number;
  fileCount: number;
  learnedRules: Array<{ text: string; kind: string; confidence: number }>;
  totalRules: number;
  reusedExisting?: boolean;
}): string {
  const lines = [
    'TASTE',
    `└ ${reusedExisting ? 'loaded your coding taste' : 'learned your coding taste'}`,
    '  ■ Organizing your sessions',
    `  ● Codebase: ${fileCount} file${fileCount === 1 ? '' : 's'} sampled`,
    `  ● Config: ${configCount} file${configCount === 1 ? '' : 's'} analyzed`,
    '  ■ Learning your coding taste',
  ];

  if (learnedRules.length === 0) {
    lines.push('    ◦ No strong patterns detected yet.');
    lines.push('    ◦ Keep accepting, rejecting, and editing outputs so Taste can learn from real feedback.');
  } else {
    for (const rule of learnedRules.slice(0, 8)) {
      lines.push(`    ${getRuleGlyph(rule.kind)} ${rule.text}`);
    }
  }

  lines.push('  ■ Learning complete');
  if (reusedExisting) {
    lines.push(`    Loaded ${totalRules} existing rule${totalRules === 1 ? '' : 's'}.`);
  } else {
    lines.push(`    Learned from ${added} new pattern${added === 1 ? '' : 's'} (${totalRules} total rules).`);
  }

  return lines.join('\n');
}

function getRuleGlyph(kind: string): string {
  switch (kind) {
    case 'tooling':
      return '◆';
    case 'workflow':
      return '▶';
    case 'architecture':
      return '▲';
    case 'testing':
      return '★';
    case 'ui':
      return '■';
    default:
      return '●';
  }
}

function InitFlow({ runtime, onDone }: { runtime: TasteRuntime; onDone: LocalJSXCommandOnDone }): React.ReactNode {
  return (
    <TasteInitProgress
      runtime={runtime}
      onDone={result => {
        onDone(result, { display: 'system' });
      }}
    />
  );
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const arg = args.trim();

  const runtime = getTasteRuntime();
  try {
    await initRuntime();
  } catch {
    // Runtime may already be initialized
  }

  if (arg === 'on') {
    runtime.updateConfig({ enabled: true });
    runtime.notifyTaste('enabled', 'taste-enabled', 'medium');
    onDone('taste enabled', { display: 'system' });
    return null;
  }

  if (arg === 'off') {
    runtime.updateConfig({ enabled: false });
    runtime.notifyTaste('disabled', 'taste-disabled', 'medium');
    onDone('taste disabled', { display: 'system' });
    return null;
  }

  if (arg === 'learn') {
    onDone(undefined, { display: 'skip', nextInput: '/taste learn ', submitNextInput: false });
    return null;
  }

  if (arg === 'forget') {
    onDone(undefined, { display: 'skip', nextInput: '/taste forget ', submitNextInput: false });
    return null;
  }

  if (
    arg.startsWith('learn ') ||
    arg.startsWith('forget ') ||
    arg.startsWith('suggest') ||
    arg === 'profile' ||
    arg === 'events' ||
    arg === 'decay' ||
    arg === 'eval' ||
    arg === 'export' ||
    arg === 'import' ||
    arg === 'status'
  ) {
    const { handleNonInteractive } = await import('./taste-noninteractive.js');
    const result = await handleNonInteractive(arg, runtime);
    onDone(result, { display: 'system' });
    return null;
  }

  if (arg === 'init') {
    return <InitFlow runtime={runtime} onDone={onDone} />;
  }

  return <InitFlow runtime={runtime} onDone={onDone} />;
};
