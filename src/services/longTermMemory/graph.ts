/**
 * Knowledge Graph — redirected to MemoryDB.
 */

import { MemoryDB } from '../../memory/database.js';

export type NodeType = 'file' | 'concept' | 'decision' | 'tool' | 'pattern';
export type EdgeType = 'references' | 'implements' | 'depends-on' | 'related-to';

export interface GraphNode { id: string; type: NodeType; label: string; weight: number }
export interface GraphEdge { from: string; to: string; type: EdgeType; weight: number }

export function recordSessionGraph(_pr: string, _s: string, decisions: string[], files: string[], _t: string[], _m: string, _p: string): void {
  if (!MemoryDB.isInitialized()) return;
  try { const db = MemoryDB.getInstance(); const pw = process.cwd();
    for (const d of decisions) { const k = `graph.d.${d.toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,50)}`; if (k !== 'graph.d.' && !db.findByKey(k)) db.upsertMemory({key:k, projectPath:pw, type:'decision', content:d, importance:0.6, confidence:0.6}); }
    for (const f of files) { const k = `graph.f.${f.replace(/[\\/.:]/g,'_').toLowerCase().slice(0,50)}`; if (k !== 'graph.f.' && !db.findByKey(k)) db.upsertMemory({key:k, projectPath:pw, type:'reference', content:`File: ${f}`, importance:0.4, confidence:0.5}); }
  } catch{/* */}
}

export function getGraphStats(_pr: string): { nodeCount: number; edgeCount: number; byType: Record<string, number> } {
  if (!MemoryDB.isInitialized()) return { nodeCount:0, edgeCount:0, byType:{} };
  try { const s=MemoryDB.getInstance().getStats(); const ns=new Set(['decision','reference','architecture']); const bt:Record<string,number>={}; let nc=0; for(const[t,c]of Object.entries(s.byType)) if(ns.has(t)){bt[t]=c;nc+=c;} return {nodeCount:nc, edgeCount:0, byType:bt}; }
  catch{ return {nodeCount:0, edgeCount:0, byType:{}}; }
}

export function findNodes(_pr: string, q: string): GraphNode[] {
  if (!MemoryDB.isInitialized()) return [];
  try { return MemoryDB.getInstance().recallMemories({query:q, limit:20}).map((m,i)=>({id:m.id, type:(m.type==='decision'?'decision':'concept')as NodeType, label:m.content.slice(0,80), weight:m.importance})); }
  catch{ return []; }
}

export function getRelatedSessions(_pr: string, _id: string): string[] { return []; }
export function traverse(_pr: string, _s: string, _o?: {maxDepth?: number}): GraphNode[] { return []; }
export function getSessionGraph(_pr: string, _id: string): { nodes: GraphNode[]; edges: GraphEdge[] } { return {nodes:[], edges:[]}; }
