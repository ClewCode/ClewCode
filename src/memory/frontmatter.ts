import type { MemoryMetadata, MemoryType } from './types.js';

const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface ParsedMemory {
  metadata: MemoryMetadata;
  content: string;
}

export function parseFrontmatter(text: string, defaultId: string, defaultType: MemoryType): ParsedMemory {
  const match = text.match(FM_REGEX);

  const metadata: Partial<MemoryMetadata> = {
    id: defaultId,
    type: defaultType,
  };

  if (!match) {
    return {
      metadata: metadata as MemoryMetadata,
      content: text,
    };
  }

  const [, yamlBlock, content] = match;

  const lines = yamlBlock.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    let val = line.slice(colonIdx + 1).trim();

    // Clean quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (key === 'id') {
      metadata.id = val;
    } else if (key === 'type') {
      metadata.type = val as MemoryType;
    } else if (key === 'scope') {
      metadata.scope = val;
    } else if (key === 'visibility') {
      metadata.visibility = val as 'local' | 'remote';
    } else if (key === 'confidence') {
      metadata.confidence = val as 'low' | 'medium' | 'high';
    } else if (key === 'source') {
      metadata.source = val;
    } else if (key === 'created' || key === 'created_at') {
      metadata.created = val;
    } else if (key === 'updated' || key === 'updated_at') {
      metadata.updated = val;
    } else if (key === 'suggested_target') {
      metadata.suggested_target = val;
    } else if (key === 'source_run') {
      metadata.source_run = val;
    } else if (key === 'tags') {
      // Tags might be YAML array or comma-separated list
      if (val.startsWith('[') && val.endsWith(']')) {
        metadata.tags = val
          .slice(1, -1)
          .split(',')
          .map(t => t.trim().replace(/['"]/g, ''));
      } else {
        metadata.tags = val.split(',').map(t => t.trim());
      }
    }
  }

  return {
    metadata: metadata as MemoryMetadata,
    content: content.trim(),
  };
}

export function stringifyFrontmatter(metadata: MemoryMetadata, body: string): string {
  const lines = ['---'];
  lines.push(`id: ${metadata.id}`);
  lines.push(`type: ${metadata.type}`);
  if (metadata.scope) lines.push(`scope: ${metadata.scope}`);
  if (metadata.visibility) lines.push(`visibility: ${metadata.visibility}`);
  if (metadata.confidence) lines.push(`confidence: ${metadata.confidence}`);
  if (metadata.source) lines.push(`source: ${metadata.source}`);
  if (metadata.created) lines.push(`created: ${metadata.created}`);
  if (metadata.updated) lines.push(`updated: ${metadata.updated}`);
  if (metadata.suggested_target) lines.push(`suggested_target: ${metadata.suggested_target}`);
  if (metadata.source_run) lines.push(`source_run: ${metadata.source_run}`);
  if (metadata.tags && metadata.tags.length > 0) {
    lines.push(`tags: [${metadata.tags.join(', ')}]`);
  }
  lines.push('---');
  lines.push('');
  lines.push(body.trim());
  return lines.join('\n');
}
