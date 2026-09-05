import fs from 'node:fs/promises';

/**
 * Replace a text file without exposing a partially-written destination.
 * The temporary file lives beside the destination so rename stays on the
 * same filesystem and is atomic on supported local filesystems.
 */
export async function writeTextFileAtomic(filePath: string, content: string, mode = 0o600): Promise<void> {
  const tempPath = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`;
  try {
    await fs.writeFile(tempPath, content, { encoding: 'utf-8', mode });
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
