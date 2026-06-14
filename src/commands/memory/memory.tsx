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
    const fsImpl = getFsImplementation();
    const config = getDefaultConfig(cwd);

    switch (subcommand) {
      case 'init': {
        await initMemoryWorkspace(cwd);
        onDone('🟢 Clew Memory workspace layout successfully initialized under `.clew/`', { display: 'system' });
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
            ].filter(Boolean).join('\n'),
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

      case 'xp':
      case 'experience': {
        try {
          const { getExperienceReport } = await import('../../services/longTermMemory/experience.js');
          onDone(getExperienceReport(cwd), { display: 'system' });
        } catch (err: any) {
          onDone(`Error: ${err.message}`, { display: 'system' });
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
          const { previewConsolidation, getConsolidationCandidates } =
            await import('../../services/longTermMemory/consolidate.js');
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

      default: {
        onDone(
          [
            `Unknown subcommand: "${subcommand}"`,
            '',
            'Available Subcommands:',
            '  init                 Initialize memory directories & configurations',
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
            '  xp                   Show experience report and expertise profile',
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
