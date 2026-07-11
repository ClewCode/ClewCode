import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Box, Text } from '../../ink.js';
import { clearAllVectors, closeIndex, getIndexStats, pruneOldVectors } from '../../memdir/semanticSearch.js';
import type { LocalJSXCommandCall } from '../../types/command.js';

/**
 * Semantic Index Admin Command
 * Manage and inspect the sqlite-vec vector index.
 *
 * Usage:
 *   /index-admin stats     - Show index statistics
 *   /index-admin prune 90  - Remove vectors older than N days
 *   /index-admin clear     - Clear all vectors (dangerous!)
 *   /index-admin close     - Close database connection
 */

function IndexAdminComponent({
  action,
  param,
  onDone,
}: {
  action?: string;
  param?: string;
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}): React.ReactNode {
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        switch (action) {
          case 'stats': {
            const stats = getIndexStats();
            const lines = [
              '📊 Semantic Index Statistics:',
              `  Total vectors: ${stats.total}`,
              `  Engine: ${stats.vecExtensionLoaded ? 'sqlite-vec (KNN)' : 'JS brute-force (extension not loaded)'}`,
              `  Types: ${Object.entries(stats.byType)
                .map(([type, count]) => `${type} (${count})`)
                .join(', ')}`,
              stats.oldestIndexedAt
                ? `  Oldest: ${new Date(stats.oldestIndexedAt).toISOString()}`
                : '  No vectors indexed',
              stats.newestIndexedAt ? `  Newest: ${new Date(stats.newestIndexedAt).toISOString()}` : '',
            ].filter(Boolean);

            setResult(lines.join('\n'));
            break;
          }

          case 'prune': {
            const days = parseInt(param || '90', 10);
            if (isNaN(days) || days < 0) {
              setError('Invalid day count. Use: /index-admin prune 90');
              break;
            }

            const pruned = pruneOldVectors(days);
            setResult(`✂️  Pruned ${pruned} vectors older than ${days} days`);
            break;
          }

          case 'clear': {
            if (param !== '--confirm') {
              setError('⚠️  Destructive operation! Confirm with: /index-admin clear --confirm');
              break;
            }

            clearAllVectors();
            setResult('🗑️  Cleared all vectors from index');
            break;
          }

          case 'close': {
            closeIndex();
            setResult('✅ Database connection closed');
            break;
          }

          default:
            setResult(
              [
                '📚 Semantic Index Admin Commands:',
                '',
                'Usage: /index-admin <action> [param]',
                '',
                'Actions:',
                '  stats              Show index statistics and health',
                '  prune [days]       Remove vectors older than N days (default: 90)',
                '  clear --confirm    Clear all vectors (DESTRUCTIVE)',
                '  close              Close database connection',
              ].join('\n'),
            );
        }
      } catch (err) {
        setError(`Error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [action, param]);

  if (loading) {
    return <Text>Loading...</Text>;
  }

  if (error) {
    onDone(error, { display: 'error' });
    return <Box />;
  }

  if (result) {
    onDone(result, { display: 'system' });
    return <Box />;
  }

  return <Box />;
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parts = args?.trim().split(/\s+/) ?? [];
  const action = parts[0];
  const param = parts.slice(1).join(' ');

  return <IndexAdminComponent action={action} param={param} onDone={onDone} />;
};
