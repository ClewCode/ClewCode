import { readdir, readFile, stat } from 'fs/promises';
import { basename, join, relative } from 'path';
import { getFsImplementation } from '../utils/fsOperations.js';
import { type ParsedMemory, parseFrontmatter } from './frontmatter.js';
import type { MemoryType } from './types.js';

export interface ScannedMemoryDocument extends ParsedMemory {
  filePath: string;
  relPath: string;
  mtimeMs: number;
  size: number;
}

export async function scanDirectory(
  dirPath: string,
  baseDir: string,
  defaultType: MemoryType,
  excludeGlobs: string[] = [],
): Promise<ScannedMemoryDocument[]> {
  const fsImpl = getFsImplementation();
  if (!fsImpl.existsSync(dirPath)) return [];

  const results: ScannedMemoryDocument[] = [];
  const entries = await readdir(dirPath);

  // Quick helper to check if path matches exclude globs
  // For a simple robust implementation, we can do basic substring/regex matching or picomatch if installed.
  // We saw 'picomatch' in package.json! Yes, we can import it if we want, or just write a simple exclude check.
  // Let's write a simple pattern match or import picomatch.
  let isExcluded = (rel: string): boolean => {
    for (const glob of excludeGlobs) {
      const cleanGlob = glob.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
      const regex = new RegExp(`^${cleanGlob}$`);
      if (regex.test(rel)) return true;
    }
    return false;
  };

  try {
    const picomatch = (await import('picomatch')).default;
    const isMatch = picomatch(excludeGlobs);
    isExcluded = (rel: string) => isMatch(rel);
  } catch {
    // Fallback to simple matching if picomatch isn't loaded
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');

    if (isExcluded(relPath)) continue;

    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      const subResults = await scanDirectory(fullPath, baseDir, defaultType, excludeGlobs);
      results.push(...subResults);
    } else if (stats.isFile() && entry.endsWith('.md')) {
      const content = await readFile(fullPath, 'utf-8');
      const fileName = basename(entry, '.md');
      const defaultId = `ceph:memory:${defaultType}:${fileName.toLowerCase()}`;

      // Inferred type based on path
      let type = defaultType;
      if (relPath.startsWith('user/')) type = 'user';
      else if (relPath.startsWith('project/')) type = 'project';
      else if (relPath.startsWith('feedback/')) type = 'feedback';
      else if (relPath.startsWith('agent/')) type = 'agent';
      else if (relPath.startsWith('pending/')) type = 'pending';

      const parsed = parseFrontmatter(content, defaultId, type);

      results.push({
        ...parsed,
        filePath: fullPath,
        relPath,
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      });
    }
  }

  return results;
}
