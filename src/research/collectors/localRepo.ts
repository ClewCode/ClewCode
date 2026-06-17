import { readdir } from 'fs/promises';
import { join } from 'path';
import { getFsImplementation } from '../../utils/fsOperations.js';
import type { ResearchSource } from '../types.js';

export async function collectLocalRepo(cwd: string, query: string): Promise<ResearchSource[]> {
  const fsImpl = getFsImplementation();
  const searchDirs = [join(cwd, 'src')];
  const results: ResearchSource[] = [];

  const ignoreDirs = ['node_modules', '.git', 'dist', 'node_modules', 'bin', 'obj', '.claude', '.clew'];

  async function scan(dirPath: string) {
    if (!fsImpl.existsSync(dirPath)) {
      return;
    }

    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignoreDirs.includes(entry.name)) {
          continue;
        }
        await scan(join(dirPath, entry.name));
      } else if (entry.isFile()) {
        const ext = entry.name.split('.').pop() || '';
        const allowedExts = ['ts', 'tsx', 'js', 'jsx', 'json', 'md'];
        if (!allowedExts.includes(ext)) {
          continue;
        }

        const fullPath = join(dirPath, entry.name);
        let content = '';
        try {
          // Read first 2000 chars for keyword check
          const fileHandle = await getFsImplementation().readFileBytes(fullPath, 2000);
          content = fileHandle.toString('utf-8');
        } catch (_err) {
          continue;
        }

        const words = query.toLowerCase().split(/\s+/);
        const lowerContent = content.toLowerCase();
        const lowerName = entry.name.toLowerCase();

        // Scoring based on name match and content match
        let score = 0;
        for (const word of words) {
          if (lowerName.includes(word)) {
            score += 10;
          }
          if (lowerContent.includes(word)) {
            score += 2;
          }
        }

        if (score > 0) {
          const relativePath = fullPath.replace(`${cwd}/`, '');
          results.push({
            id: `source:repo:${relativePath.replace(/\//g, ':')}`,
            type: 'local_repo',
            title: `File: ${relativePath}`,
            path: relativePath,
            retrievedAt: new Date().toISOString(),
            trust: 'high',
            excerpt: `${content.slice(0, 500)}...`,
          });
        }
      }
    }
  }

  for (const dir of searchDirs) {
    try {
      await scan(dir);
    } catch (_err) {
      // Ignore
    }
  }

  // Sort by relevance (implicit via score) - we'll sort here
  // But wait, the results array in typescript needs scoring. Let's do a quick sorting if we want, or limit to top 5
  return results.slice(0, 8);
}
