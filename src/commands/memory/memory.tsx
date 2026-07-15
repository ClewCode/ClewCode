import { join } from 'node:path';
import ansis from 'ansis';
import { mkdir, writeFile } from 'fs/promises';
import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { MemoryFileSelector } from '../../components/memory/MemoryFileSelector.js';
import { getRelativeMemoryPath } from '../../components/memory/MemoryUpdateNotification.js';
import { Box, Link, Text } from '../../ink.js';
import { getDefaultConfig } from '../../memory/config.js';
import { getMemoryDb } from '../../memory/db.js';
import { ingestMemoryWorkspace } from '../../memory/ingest.js';
import { approveMemory, forgetMemory, listPending, rejectMemory } from '../../memory/pending.js';
import { searchMemories } from '../../memory/search.js';
import { getAllSources } from '../../memory/store.js';

// Plan E imports
import { getMemoryWorkspaceStatus, initMemoryWorkspace } from '../../memory/workspace.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { clearMemoryFileCaches, getMemoryFiles } from '../../utils/claudemd.js';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';
import { getErrnoCode } from '../../utils/errors.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import { logError } from '../../utils/log.js';
import { editFileInEditor } from '../../utils/promptEditor.js';

function MemoryCommand({
  onDone,
}: {
  onDone: (
    result?: string,
    options?: {
      display?: CommandResultDisplay;
    },
  ) => void;
}): React.ReactNode {
  const handleSelectMemoryFile = async (memoryPath: string) => {
    try {
      if (memoryPath.includes(getClaudeConfigHomeDir())) {
        await mkdir(getClaudeConfigHomeDir(), {
          recursive: true,
        });
      }

      try {
        await writeFile(memoryPath, '', {
          encoding: 'utf8',
          flag: 'wx',
        });
      } catch (e: unknown) {
        if (getErrnoCode(e) !== 'EEXIST') {
          throw e;
        }
      }
      await editFileInEditor(memoryPath);

      let editorSource = 'default';
      let editorValue = '';
      if (process.env.VISUAL) {
        editorSource = '$VISUAL';
        editorValue = process.env.VISUAL;
      } else if (process.env.EDITOR) {
        editorSource = '$EDITOR';
        editorValue = process.env.EDITOR;
      }
      const editorInfo = editorSource !== 'default' ? `Using ${editorSource}="${editorValue}".` : '';
      const editorHint = editorInfo
        ? `> ${editorInfo} To change editor, set $EDITOR or $VISUAL environment variable.`
        : `> To use a different editor, set the $EDITOR or $VISUAL environment variable.`;
      onDone(`Opened memory file at ${getRelativeMemoryPath(memoryPath)}\n\n${editorHint}`, {
        display: 'system',
      });
    } catch (error) {
      logError(error);
      onDone(`Error opening memory file: ${error}`);
    }
  };
  const handleCancel = () => {
    onDone('Cancelled memory editing', {
      display: 'system',
    });
  };
  return (
    <Dialog title="Memory" onCancel={handleCancel} color="remember">
      <Box flexDirection="column">
        <React.Suspense fallback={null}>
          <MemoryFileSelector onSelect={handleSelectMemoryFile} onCancel={handleCancel} />
        </React.Suspense>

        <Box marginTop={1}>
          <Text dimColor>
            Learn more: <Link url="https://code.claude.com/docs/en/memory" />
          </Text>
        </Box>
      </Box>
    </Dialog>
  );
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const cwd = process.cwd();
  const argv = args.trim().split(/\s+/);
  const subcommand = argv[0]?.toLowerCase();

  if (subcommand) {
    const _fsImpl = getFsImplementation();
    const config = getDefaultConfig(cwd);

    switch (subcommand) {
      case 'init': {
        await initMemoryWorkspace(cwd);
        try {
          const { MemoryDB } = await import('../../memory/database.js');
          const { initMemoryHierarchy, getMemoryDbPath } = await import('../../memory/hierarchy.js');
          const { budgetedInject } = await import('../../memory/budgetInjector.js');

          await initMemoryHierarchy();
          if (!MemoryDB.isInitialized()) {
            MemoryDB.init(getMemoryDbPath());
          }
          const stats = MemoryDB.getInstance().getStats();

          // Auto-migrate legacy session data
          let migrationNote = '';
          try {
            const { migrateFromSessionDB } = await import('../../memory/migrateLegacy.js');
            const migrationResult = migrateFromSessionDB();
            if (migrationResult.sessionsImported > 0 || migrationResult.digestsImported > 0) {
              migrationNote = `  Legacy sessions: ${migrationResult.sessionsImported} imported · ${migrationResult.digestsImported} digests`;
            }
          } catch {
            /* migration unavailable */
          }

          // Auto-run rebuild as final step
          const context = await budgetedInject(2000, true);
          const parts: string[] = [
            '🟢 Memory system initialized:',
            `  Workspace: .clew/memory/`,
            `  Database: ${getMemoryDbPath()}`,
            `  Memories: ${stats.total} entries`,
            `  Types: ${
              Object.entries(stats.byType)
                .map(([t, c]) => `${t}: ${c}`)
                .join(', ') || '(empty)'
            }`,
            ...(migrationNote ? [migrationNote] : []),
          ];
          if (context) {
            parts.push('', '=== Reconstructed Context ===', '', context, '', '=== End ===');
          } else {
            parts.push(
              '',
              'No memories found yet.',
              'Next: run /memory scan to bootstrap project knowledge from your codebase.',
            );
          }
          onDone(parts.join('\n'), { display: 'system' });
        } catch {
          onDone('🟢 Memory workspace layout initialized under `.clew/` (SQLite unavailable)', { display: 'system' });
        }
        return null;
      }

      case 'scan': {
        try {
          const { MemoryDB } = await import('../../memory/database.js');
          const { initMemoryHierarchy, getMemoryDbPath } = await import('../../memory/hierarchy.js');
          const { scanRepo } = await import('../../memory/scanner.js');

          await initMemoryHierarchy();
          if (!MemoryDB.isInitialized()) {
            MemoryDB.init(getMemoryDbPath());
          }

          const result = await scanRepo();
          const lines: string[] = [
            'Memory scan complete:',
            '',
            'Stack:',
            `  ${result.language} project`,
            `  Package manager: ${result.packageManager}`,
            `  Runtime: ${result.runtime}`,
            result.framework !== 'none' ? `  Framework: ${result.framework}` : '',
            result.entrypoints.length > 0 ? `  Entrypoints: ${result.entrypoints.join(', ')}` : '',
            result.hasProviderSystem ? '  Provider routing: Yes' : '',
            '',
            `Seed memories: ${result.created} created · ${result.updated} updated · ${result.unchanged} unchanged`,
            '',
            'Files updated:',
            '  MEMORY.md',
            '  DECISIONS.md',
            '  TASTE.md',
          ];
          if (result.warnings.length > 0) {
            lines.push('', 'Warnings:', ...result.warnings.map(w => `  ${w}`));
          }
          onDone(lines.join('\n'), { display: 'system' });
        } catch (err: any) {
          onDone(`Error scanning repo: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'ingest': {
        const result = await ingestMemoryWorkspace(cwd, config);
        onDone(
          [
            '🟢 Memory Ingestion Complete:',
            `  Scanned: ${result.scannedCount} files`,
            `  Added: ${result.addedCount} new files`,
            `  Updated: ${result.updatedCount} changed files`,
            `  Deleted: ${result.deletedCount} removed files`,
            `  Indexed Chunks: ${result.totalChunks} chunks in SQLite FTS5`,
          ].join('\n'),
          { display: 'system' },
        );
        return null;
      }

      case 'reindex': {
        // Clear chunks in SQLite
        const db = getMemoryDb(cwd);
        db.run('DELETE FROM chunks');
        db.run('DELETE FROM chunks_fts');
        db.run('DELETE FROM sources');

        const result = await ingestMemoryWorkspace(cwd, config);
        onDone(
          [
            '🟢 SQLite Search Cache Wiped & Reindexed Successfully:',
            `  Scanned: ${result.scannedCount} files`,
            `  Total Chunks: ${result.totalChunks} chunks`,
          ].join('\n'),
          { display: 'system' },
        );
        return null;
      }

      case 'search': {
        const query = argv.slice(1).join(' ');
        if (!query) {
          onDone('Error: Please provide a search query. Example: `/memory search "coding guidelines"`', {
            display: 'system',
          });
          return null;
        }

        const matches = await searchMemories(cwd, query, 5);
        if (matches.length === 0) {
          onDone(`No memory records matched: "${query}"`, { display: 'system' });
          return null;
        }

        const matchLines = matches.map(
          (m, i) =>
            `${i + 1}. **[${m.id}]** ${m.title} (${m.sourceType}) [Score: ${(m.score * 100).toFixed(0)}%]\n` +
            `   Path: \`${m.sourcePath}\`\n` +
            `   Excerpt:\n` +
            `   """\n` +
            `   ${m.excerpt.slice(0, 300)}${m.excerpt.length > 300 ? '...' : ''}\n` +
            `   """`,
        );

        onDone([`Search results for "${query}":`, '', ...matchLines].join('\n'), { display: 'system' });
        return null;
      }

      case 'pending': {
        const pendingList = await listPending(cwd);
        if (pendingList.length === 0) {
          onDone('🟢 No proposed memory candidates pending review.', { display: 'system' });
          return null;
        }

        const listLines = pendingList.map(
          p =>
            `- **ID:** \`${p.id}\` (Target: \`${p.suggestedTarget}\`)\n` +
            `  Proposed Facts:\n` +
            p.proposedFacts.map(f => `    * ${f}`).join('\n'),
        );

        onDone(['Pending Memory Suggestions:', '', ...listLines].join('\n'), { display: 'system' });
        return null;
      }

      case 'approve': {
        const pendingId = argv[1];
        if (!pendingId) {
          onDone(
            'Error: Please specify the pending-id to approve. Example: `/memory approve claude:pending:2026-05-20:abcde`',
            { display: 'system' },
          );
          return null;
        }

        try {
          const targetPath = await approveMemory(cwd, pendingId);
          // Ingest target path changes
          await ingestMemoryWorkspace(cwd, config);
          onDone(`🟢 Approved pending memory suggestion! Facts successfully merged into: \`${targetPath}\``, {
            display: 'system',
          });
        } catch (err: any) {
          onDone(`Error approving suggestion: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'reject': {
        const pendingId = argv[1];
        if (!pendingId) {
          onDone('Error: Please specify the pending-id to reject.', { display: 'system' });
          return null;
        }

        try {
          await rejectMemory(cwd, pendingId);
          onDone(`🟢 Rejected pending memory suggestion \`${pendingId}\`. Suggestion file deleted.`, {
            display: 'system',
          });
        } catch (err: any) {
          onDone(`Error rejecting suggestion: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'forget': {
        const memoryId = argv[1];
        if (!memoryId) {
          onDone('Error: Please specify the memory-id to forget.', { display: 'system' });
          return null;
        }

        try {
          await forgetMemory(cwd, memoryId);
          onDone(`🟢 Successfully forgot memory \`${memoryId}\`. Associated file and FTS index removed.`, {
            display: 'system',
          });
        } catch (err: any) {
          onDone(`Error forgetting memory: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'doctor': {
        const status = getMemoryWorkspaceStatus(cwd);
        const db = getMemoryDb(cwd);
        const sources = getAllSources(db);
        const pendingList = await listPending(cwd);

        const chunksCount = db.query('SELECT COUNT(*) as c FROM chunks').get() as { c: number };

        onDone(
          [
            'Claude Memory Diagnostics:',
            `  Enabled: ${status.initialized ? 'Yes 🟢' : 'No 🔴'}`,
            `  Workspace Memory Path: \`${status.memoryDir}\``,
            `  Wiki Directory: \`${status.wikiDir}\``,
            `  SQLite Cache Path: \`${join(status.indexDir, 'chunks.db')}\``,
            `  Runs Directory: \`${status.runsDir}\``,
            `  Active Sources: ${sources.length}`,
            `  Indexed Chunks: ${chunksCount ? chunksCount.c : 0}`,
            `  Pending Suggestions: ${pendingList.length}`,
            `  Secret Redaction: Enabled`,
          ].join('\n'),
          { display: 'system' },
        );
        return null;
      }

      case 'timeline': {
        try {
          const { queryTimeline, formatTimeline } = await import('../../services/longTermMemory/timeline.js');
          const rows = queryTimeline(cwd, { limit: 20 });
          if (rows.length === 0) {
            onDone('No session history yet. Sessions are recorded automatically.', { display: 'system' });
          } else {
            onDone(formatTimeline(rows), { display: 'system' });
          }
        } catch (err: any) {
          onDone(`Error loading timeline: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'rebuild': {
        try {
          const { MemoryDB } = await import('../../memory/database.js');
          const { initMemoryHierarchy, getMemoryDbPath } = await import('../../memory/hierarchy.js');
          await initMemoryHierarchy();
          if (!MemoryDB.isInitialized()) {
            MemoryDB.init(getMemoryDbPath());
          }
          const { budgetedInjectDetailed } = await import('../../memory/budgetInjector.js');
          const result = await budgetedInjectDetailed(2000, true);
          if (!result.text && result.injected.length === 0) {
            onDone('No memories to rebuild from. Run /memory scan first.', { display: 'system' });
            return null;
          }
          const lines: string[] = [
            '=== Reconstructed Context ===',
            '',
            result.text || '(no memories injected)',
            '',
            '---',
            `Budget: ${result.usedTokens}/${result.totalBudget} tokens used`,
            '',
          ];
          if (result.injected.length > 0) {
            lines.push('Injected:');
            for (const m of result.injected) {
              lines.push(
                `  ${m.key} (${m.type}, importance:${m.importance.toFixed(2)}, score:${m.score.toFixed(3)}, ${m.tokens} tok)`,
              );
            }
            lines.push('');
          }
          if (result.skipped.length > 0) {
            lines.push('Skipped:');
            for (const m of result.skipped) {
              lines.push(`  ${m.key}: ${m.reason}`);
            }
            lines.push('');
          }
          lines.push('=== End ===');
          onDone(lines.join('\n'), { display: 'system' });
        } catch (err: any) {
          onDone(`Error rebuilding context: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'recall': {
        try {
          const { MemoryDB } = await import('../../memory/database.js');
          const { initMemoryHierarchy, getMemoryDbPath } = await import('../../memory/hierarchy.js');
          await initMemoryHierarchy();
          if (!MemoryDB.isInitialized()) {
            MemoryDB.init(getMemoryDbPath());
          }
          const verbose = argv.includes('--verbose') || argv.includes('-v');
          const limitIdx = argv.indexOf('--limit');
          const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) || 10 : 10;
          // Extract query: everything between 'recall' and first flag
          const recallIdx = argv.indexOf('recall');
          const queryTokens =
            recallIdx >= 0
              ? argv
                  .slice(recallIdx + 1)
                  .filter(
                    a => !a.startsWith('-') && a !== `--limit` && a !== `${limit}` && a !== '--verbose' && a !== '-v',
                  )
              : [];
          const query = queryTokens.join(' ');
          const memories = MemoryDB.getInstance().recallMemories({
            projectPath: cwd,
            query: query || undefined,
            limit,
            verbose,
          });
          if (memories.length === 0) {
            onDone('No memories found. Run /memory scan first.', { display: 'system' });
            return null;
          }
          const lines: string[] = [`Top ${memories.length} memories:`, ''];
          for (let i = 0; i < memories.length; i++) {
            const m = memories[i]!;
            const scoreStr = m.score.toFixed(3);
            lines.push(
              `${i + 1}. [${scoreStr}] ${m.type}: ${m.content.length > 80 ? m.content.slice(0, 80) + '...' : m.content}`,
            );
            lines.push(
              `   key: ${m.id} · importance: ${m.importance} · confidence: ${m.confidence} · accessed: ${m.accessCount}x`,
            );
            if (verbose && m.scoreBreakdown) {
              const b = m.scoreBreakdown;
              lines.push(
                `   score: importance=${b.importance.toFixed(3)} + confidence=${b.confidence.toFixed(3)} + recency=${b.recency.toFixed(3)} + access=${b.access.toFixed(3)} = ${b.total.toFixed(3)}`,
              );
            }
          }
          onDone(lines.join('\n'), { display: 'system' });
        } catch (err: any) {
          onDone(`Error recalling memories: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'feedback': {
        try {
          const { applyFeedback } = await import('../../memory/feedback.js');
          const target = argv[1];
          const signal = argv[2] as any;
          const note = argv.slice(3).join(' ') || undefined;
          if (!target || !signal) {
            onDone(
              'Usage: /memory feedback <memory-id|key> <accepted|rejected|corrected|preferred|disliked|important|wrong> [note]',
              { display: 'system' },
            );
            return null;
          }
          const validSignals = ['accepted', 'rejected', 'corrected', 'preferred', 'disliked', 'important', 'wrong'];
          if (!validSignals.includes(signal)) {
            onDone(`Invalid signal "${signal}". Valid: ${validSignals.join(', ')}`, { display: 'system' });
            return null;
          }
          const { MemoryDB } = await import('../../memory/database.js');
          const { initMemoryHierarchy, getMemoryDbPath } = await import('../../memory/hierarchy.js');
          await initMemoryHierarchy();
          if (!MemoryDB.isInitialized()) {
            MemoryDB.init(getMemoryDbPath());
          }
          const result = await applyFeedback(target, signal, note);
          const lines: string[] = [result.success ? 'Feedback applied.' : 'Error:', `  ${result.message}`];
          if (result.importanceDelta !== 0)
            lines.push(`  importance: ${result.importanceDelta > 0 ? '+' : ''}${result.importanceDelta}`);
          if (result.confidenceDelta !== 0)
            lines.push(`  confidence: ${result.confidenceDelta > 0 ? '+' : ''}${result.confidenceDelta}`);
          if (result.wroteToTaste) lines.push('  written to TASTE.md');
          onDone(lines.join('\n'), { display: 'system' });
        } catch (err: any) {
          onDone(`Error applying feedback: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'stats': {
        try {
          const { computeDensity } = await import('../../services/longTermMemory/timeline.js');
          const density = computeDensity(cwd);
          onDone(
            [
              '## Memory Stats',
              '',
              `Total sessions: ${density.total}`,
              `First session: ${density.firstSession ?? 'N/A'}`,
              `Last session: ${density.lastSession ?? 'N/A'}`,
              `Average: ${density.avgPerDay} sessions/day`,
              '',
              density.byDay.length > 0 ? '### Activity (last 30 days)' : '',
              ...density.byDay.map(d => `  ${d.date}: ${'█'.repeat(Math.min(d.count, 20))} ${d.count}`),
            ]
              .filter(Boolean)
              .join('\n'),
            { display: 'system' },
          );
        } catch (err: any) {
          onDone(`Error loading stats: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'save': {
        const summary = argv.slice(1).join(' ') || 'Session completed';
        try {
          const { saveSessionSummary } = await import('../../services/longTermMemory/crossSession.js');
          const { recordSessionGraph } = await import('../../services/longTermMemory/graph.js');
          // Save to both flat tables and knowledge graph
          saveSessionSummary(cwd, summary, [], [], []);
          recordSessionGraph(cwd, summary, [], [], [], 'deepseek', 'openrouter');
          onDone('Session saved to memory (flat + graph).', { display: 'system' });
        } catch (err: any) {
          onDone(`Error saving memory: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'graph': {
        try {
          const { getGraphStats, recordSessionGraph } = await import('../../services/longTermMemory/graph.js');
          const stats = getGraphStats(cwd);
          onDone(
            [
              '## Knowledge Graph Memory',
              '',
              `Nodes: ${stats.nodeCount} | Edges: ${stats.edgeCount}`,
              ...Object.entries(stats.byType).map(([t, c]) => `  ${t}: ${c}`),
              '',
              '/memory save — records session as graph nodes+edges',
              '/memory timeline — view session history',
            ].join('\n'),
            { display: 'system' },
          );
        } catch (err: any) {
          onDone(`Error: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'digest':
      case 'digests': {
        try {
          const { formatDigests } = await import('../../services/longTermMemory/timeline.js');
          onDone(formatDigests(cwd), { display: 'system' });
        } catch (err: any) {
          onDone(`Error loading digests: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'preview':
      case 'consolidate': {
        try {
          const { previewConsolidation, getConsolidationCandidates } = await import(
            '../../services/longTermMemory/consolidate.js'
          );
          if (subcommand === 'preview') {
            onDone(previewConsolidation(cwd), { display: 'system' });
          } else {
            const groups = getConsolidationCandidates(cwd);
            if (!groups.length) {
              onDone('No sessions need consolidation.', { display: 'system' });
            } else {
              const total = groups.reduce((a, g) => a + g.total, 0);
              onDone(
                `🔄 ${total} sessions ready for consolidation. Run AI summary to create digests.\n\n${previewConsolidation(cwd)}`,
                { display: 'system' },
              );
            }
          }
        } catch (err: any) {
          onDone(`Error: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      case 'dashboard':
      case 'dash': {
        try {
          const lines: string[] = [ansis.bold('🧠 Memory System Dashboard'), ''];

          // ── Profile ────────────────────────────────────────────
          try {
            const appState = _context?.getAppState?.();
            if (appState?.profile) {
              const mode = appState.toolPermissionContext?.mode ?? 'default';
              const modeIcon = mode === 'bypassPermissions' ? ansis.yellow('⚡') : ansis.dim('●');
              lines.push(ansis.bold('  Profile'));
              lines.push(`    Personal  ${modeIcon} ${mode}`);
            }
          } catch {
            /* profile unavailable */
          }

          // ── MemoryDB ─────────────────────────────────────────
          const { MemoryDB } = await import('../../memory/database.js');
          const { initMemoryHierarchy, getMemoryDbPath } = await import('../../memory/hierarchy.js');
          await initMemoryHierarchy();
          if (!MemoryDB.isInitialized()) {
            MemoryDB.init(getMemoryDbPath());
          }
          const stats = MemoryDB.getInstance().getStats();
          const total = stats.total;
          const byType = Object.entries(stats.byType)
            .sort((a, b) => b[1] - a[1])
            .map(([t, c]) => `${ansis.cyan(t)} ${c}`)
            .join(' · ');
          // Count session memories for display
          let sessionCount = 0;
          try {
            const sessionMems = db.recallMemories({ query: 'session.', limit: 1000 });
            sessionCount = sessionMems.length;
          } catch {
            /* ignore */
          }

          const memStatus = total > 0 ? ansis.green(`${total} memories`) : ansis.yellow('empty');
          const sessionStr = sessionCount > 0 ? ansis.dim(` · ${sessionCount} sessions`) : '';
          lines.push(ansis.bold('  MemoryDB'));
          lines.push(`    ${memStatus}${sessionStr}  ${byType ? `[ ${byType} ]` : ''}`);

          // ── Dream ─────────────────────────────────────────────
          try {
            const { getDreamStatus } = await import('../../services/longTermMemory/dream.js');
            const dreamStatus = await getDreamStatus(cwd);
            if (dreamStatus) {
              const lastDream = dreamStatus.lastDreamAt
                ? new Date(dreamStatus.lastDreamAt).toLocaleString()
                : ansis.dim('never');
              const nextDream =
                dreamStatus.nextDreamIn > 0
                  ? ansis.dim(`${Math.round(dreamStatus.nextDreamIn / 3600000)}h`)
                  : ansis.green('ready');
              const pending =
                dreamStatus.pendingConsolidations > 0
                  ? ansis.yellow(`${dreamStatus.pendingConsolidations} pending`)
                  : ansis.dim('0 pending');
              lines.push(ansis.bold('  Dream'));
              lines.push(
                `    last ${lastDream}  ·  next ${nextDream}  ·  ${pending}  ·  runs ${dreamStatus.dreamsRun}`,
              );
            }
          } catch {
            /* dream unavailable */
          }

          // ── Distill ───────────────────────────────────────────
          try {
            const { getDistillStatus } = await import('../../services/longTermMemory/distill.js');
            const distillStatus = await getDistillStatus(cwd);
            if (distillStatus) {
              const lastDistill = distillStatus.lastDistillAt
                ? new Date(distillStatus.lastDistillAt).toLocaleString()
                : ansis.dim('never');
              const nextDistill =
                distillStatus.nextDistillIn > 0
                  ? ansis.dim(`${Math.round(distillStatus.nextDistillIn / 86400000)}d`)
                  : ansis.green('ready');
              lines.push(ansis.bold('  Distill'));
              lines.push(
                `    last ${lastDistill}  ·  next ${nextDistill}  ·  ${distillStatus.experiencesCount} experiences  ·  runs ${distillStatus.distillsRun}`,
              );
            }
          } catch {
            /* distill unavailable */
          }

          // ── Peer Memory Sync ──────────────────────────────────
          try {
            const { existsSync } = await import('node:fs');
            const { join } = await import('node:path');
            const { readFile } = await import('node:fs/promises');
            const { getProjectRoot } = await import('../../bootstrap/state.js');
            const statePath = join(getProjectRoot(), '.clew/peer-memory-sync.json');
            if (existsSync(statePath)) {
              const raw = await readFile(statePath, 'utf-8');
              const peerState = JSON.parse(raw);
              const statusIcon = peerState.enabled ? ansis.green('● ON') : ansis.dim('○ OFF');
              lines.push(ansis.bold('  Peer Sync'));
              if (peerState.enabled) {
                lines.push(
                  `    ${statusIcon}  every ${peerState.intervalMin} min  ·  cron ${peerState.cronTaskId || '—'}`,
                );
              } else {
                lines.push(`    ${statusIcon}`);
              }
            }
          } catch {
            /* peer state unavailable */
          }

          // ── Timeline ──────────────────────────────────────────
          try {
            const db = MemoryDB.getInstance();
            const recentEvents = db.getTimeline(5);
            if (recentEvents.length > 0) {
              lines.push(ansis.bold('  Recent Events'));
              for (const event of recentEvents) {
                const date = new Date(event.createdAt).toLocaleString();
                const eventLabel = event.event === 'created' ? ansis.green('+') : ansis.blue('~');
                lines.push(
                  `    ${ansis.dim('[' + date + ']')} ${eventLabel} ${event.event}${event.note ? ': ' + event.note : ''}`,
                );
              }
            }
          } catch {
            /* timeline unavailable */
          }

          lines.push('');
          lines.push(ansis.dim('  /memory help · /memory init · /memory scan · /memory recall'));
          onDone(lines.join('\n'), { display: 'system' });
        } catch (err: any) {
          onDone(`Error loading dashboard: ${err.message}`, { display: 'system' });
        }
        return null;
      }

      default: {
        onDone(
          [
            `Unknown subcommand: "${subcommand}"`,
            '',
            'Available Subcommands:',
            '  dashboard            Show memory system dashboard (MemoryDB, Dream, Distill, Peer)',
            '  init                 Initialize memory directories + SQLite MemoryDB',
            '  scan                 Scan repo and bootstrap seed memories (idempotent)',
            '  rebuild              Reconstruct context from memories (budgeted injection)',
            '  recall [--verbose]   Recall memories ranked by importance/recency/access',
            '  feedback <id|key> <signal> [note]  Accepted/rejected/corrected/preferred/disliked/important/wrong',
            '  ingest               Scan and build FTS indices over your Markdown memory files',
            '  reindex              Wipe SQLite search index and run full ingest from scratch',
            '  search <query>       Search indexed memory facts using SQLite FTS5',
            '  pending              List all pending candidate memories awaiting review',
            '  approve <id>         Approve candidate memory suggestion and append to memory',
            '  reject <id>          Reject candidate memory suggestion and delete suggestion',
            '  forget <id>          Permanently delete a memory record from disk and index',
            '  doctor               Display memory status, metrics, and health diagnostics',
            '  timeline             Show session timeline (cross-session history)',
            '  stats                Show memory density stats and activity chart',
            '  save [summary]       Save current session to long-term memory',
            '  digest               Show consolidated weekly/monthly digests',
            '  preview              Preview sessions ready for consolidation',
            '  consolidate          Mark old sessions as consolidated',
            '  graph                Show knowledge graph stats',
          ].join('\n'),
          { display: 'system' },
        );
        return null;
      }
    }
  }

  // Clear + prime before rendering Dialog UI
  clearMemoryFileCaches();
  await getMemoryFiles();
  return <MemoryCommand onDone={onDone} />;
};
