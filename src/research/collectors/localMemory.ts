import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { DOT_CLEW } from '../../utils/clewPaths.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import type { ResearchSource } from '../types.js';

export async function collectLocalMemory(cwd: string, query: string): Promise<ResearchSource[]> {
  const fsImpl = getFsImplementation();
  const memoryDir = join(cwd, DOT_CLEW, 'memory');
  if (!fsImpl.existsSync(memoryDir)) {
    return [];
  }

  const results: ResearchSource[] = [];

  async function scan(dirPath: string) {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = await readFile(fullPath, 'utf-8');

        // Simple relevance matching
        const words = query.toLowerCase().split(/\s+/);
        const lowerContent = content.toLowerCase();
        const matches = words.filter(word => lowerContent.includes(word));

        if (matches.length > 0) {
          const relativePath = fullPath.replace(`${cwd}/`, '');
          results.push({
            id: `source:memory:${entry.name.replace('.md', '')}`,
            type: 'local_memory',
            title: `Memory: ${entry.name.replace('.md', '')}`,
            path: relativePath,
            retrievedAt: new Date().toISOString(),
            trust: 'high',
            excerpt: `${content.slice(0, 500)}...`,
          });
        }
      }
    }
  }

  try {
    await scan(memoryDir);
  } catch (_err) {
    // Ignore scan issues
  }

  return results;
}
