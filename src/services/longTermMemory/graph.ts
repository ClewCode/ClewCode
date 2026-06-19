/**
 * Knowledge Graph — redirected to MemoryDB.
 */

import { MemoryDB } from '../../memory/database.js';

export type NodeType = 'file' | 'concept' | 'decision' | 'tool' | 'pattern';
export type EdgeType = 'references' | 'implements' | 'depends-on' | 'related-to';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  weight: number;
}
export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
}

export function recordSessionGraph(
  _pr: string,
  _s: string,
  decisions: string[],
  files: string[],
  _t: string[],
  _m: string,
  _p: string,
): void {
  if (!MemoryDB.isInitialized()) return;
  try {
    const db = MemoryDB.getInstance();
    const pw = process.cwd();
    for (const d of decisions) {
      const k = `graph.d.${d
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, 50)}`;
      if (k !== 'graph.d.' && !db.findByKey(k))
        db.upsertMemory({ key: k, projectPath: pw, type: 'decision', content: d, importance: 0.6, confidence: 0.6 });
    }
    for (const f of files) {
      const k = `graph.f.${f
        .replace(/[\\/.:]/g, '_')
        .toLowerCase()
        .slice(0, 50)}`;
      if (k !== 'graph.f.' && !db.findByKey(k))
        db.upsertMemory({
          key: k,
          projectPath: pw,
          type: 'reference',
          content: `File: ${f}`,
          importance: 0.4,
          confidence: 0.5,
        });
    }
  } catch {
    /* */
  }
}
