import {
  clearCodeIndex,
  formatResults,
  getCodeIndexStats,
  searchCode,
  syncCodeIndex,
} from '../../services/codeSearch/search.js';
import type { LocalCommandResult } from '../../types/command.js';

export async function call(args: string): Promise<LocalCommandResult> {
  const trimmed = args.trim();

  if (!trimmed) {
    return {
      type: 'text',
      value: 'Usage: /code-search <query>\n       /code-search stats\n       /code-search refresh',
    };
  }

  if (trimmed === 'stats' || trimmed === 'status') {
    const stats = getCodeIndexStats();
    return {
      type: 'text',
      value: `=== Code Search Index ===
• Chunks indexed: ${stats.totalChunks}
• Files: ${stats.totalFiles}
• Vector engine: ${stats.vecLoaded ? 'sqlite-vec KNN' : 'unavailable (FTS only)'}
Status: synced on demand per query`,
    };
  }

  if (trimmed === 'refresh' || trimmed === 'reindex') {
    clearCodeIndex();
    const { indexed } = await syncCodeIndex(true);
    return { type: 'text', value: `✓ Re-indexed ${indexed} chunks.` };
  }

  try {
    const results = await searchCode(trimmed);
    return { type: 'text', value: formatResults(results) };
  } catch (err) {
    return { type: 'text', value: `Search failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
