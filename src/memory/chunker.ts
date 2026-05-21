import { createHash } from 'crypto';
import type { MemoryChunk } from './types.js';

export function estimateTokenCount(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

export function generateContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function chunkMarkdown(
  sourceId: string,
  markdown: string,
  maxChunkTokens: number = 3000,
  priority: number = 50,
): MemoryChunk[] {
  const chunks: MemoryChunk[] = [];
  const lines = markdown.split('\n');

  let currentChunkLines: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  const saveCurrentChunk = () => {
    if (currentChunkLines.length === 0) return;

    const chunkText = currentChunkLines.join('\n').trim();
    if (chunkText.length === 0) return;

    const contentHash = generateContentHash(chunkText);
    const chunkId = `${sourceId}:chunk:${chunkIndex}`;

    chunks.push({
      id: chunkId,
      sourceId,
      chunkIndex,
      markdown: chunkText,
      tokenCount: estimateTokenCount(chunkText),
      contentHash,
      truthPriority: priority,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    chunkIndex++;
    currentChunkLines = [];
    currentTokens = 0;
  };

  for (const line of lines) {
    const lineTokens = estimateTokenCount(line);

    // If it's a new main header and we already have content, split there for cleaner boundaries
    const isNewHeader = line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### ');

    if (
      (currentTokens + lineTokens > maxChunkTokens || (isNewHeader && currentTokens > 300)) &&
      currentChunkLines.length > 0
    ) {
      saveCurrentChunk();
    }

    currentChunkLines.push(line);
    currentTokens += lineTokens;
  }

  // Save remaining chunk
  saveCurrentChunk();

  return chunks;
}
