/**
 * AutoMemory — automatically captures lessons from edit/exec sessions.
 *
 * Hooks into PostToolUse to extract key patterns, decisions, and facts
 * from FileEditTool/FileWriteTool/BashTool results and persists them
 * to the memory store, long-term memory, and knowledge graph.
 */

import { getOriginalCwd } from '../bootstrap/state.js';
import { recordSessionGraph } from '../services/longTermMemory/graph.js';
import { storeContext } from './memoryStore.js';
import { saveSessionSummary } from '../services/longTermMemory/crossSession.js';
import { awardNodeXP } from '../services/longTermMemory/experience.js';

export interface ToolResultEvent {
  toolName: string;
  args: Record<string, unknown>;
  result: { ok: boolean; summary?: string; data?: unknown };
  durationMs: number;
}

// ── Key pattern extraction ──

const PATTERN_RE = /(use|use|fix|add|implement|refactor|change|update|remove|migrate)\s+([a-z_/.-]+)/gi;
const DECISION_RE = /(decided|chose|switched|migrated|renamed|extracted|consolidated)\s+([a-z_/.-]+)/gi;
const TAG_RE = /#([a-z0-9_-]+)/gi;

function extractTags(text: string, files: string[]): string[] {
  const tags = new Set<string>();
  for (const m of text.matchAll(TAG_RE)) tags.add(m[1].toLowerCase());
  for (const f of files) {
    const ext = f.split('.').pop();
    if (ext) tags.add(ext);
    const dir = f.split('/')[0];
    if (dir && dir.length > 1) tags.add(dir);
  }
  return [...tags].slice(0, 10);
}

function extractDecisions(text: string): string[] {
  const decisions = new Set<string>();
  for (const m of text.matchAll(DECISION_RE)) {
    decisions.add(`${m[1]} ${m[2]}`);
  }
  return [...decisions].slice(0, 5);
}

function extractFiles(args: Record<string, unknown>): string[] {
  const files: string[] = [];
  if (typeof args.file_path === 'string') files.push(args.file_path);
  if (typeof args.filePath === 'string') files.push(args.filePath);
  if (typeof args.command === 'string') {
    const m = args.command.match(/(?:^|\s)([a-z_./][a-z0-9_./-]+\.[a-z]+)/gi);
    if (m) files.push(...m.map((s: string) => s.trim()));
  }
  return [...new Set(files)].slice(0, 5);
}

// ── Main capture function ──

/**
 * Capture a lesson from a tool result.
 * Call this from PostToolUse hooks or the agent loop.
 */
export function captureLesson(event: ToolResultEvent): void {
  if (!event.result.ok) return;

  const cwd = getOriginalCwd();
  const summary = event.result.summary || '';
  const files = extractFiles(event.args);
  const tags = extractTags(summary, files);
  const decisions = extractDecisions(summary);

  // Nothing meaningful to capture
  if (!summary && !files.length) return;

  // Store key-value context
  const key = `tool:${event.toolName}:${files[0] || Date.now()}`;
  storeContext(key, summary, {
    type: event.toolName === 'Bash' ? 'command' : 'edit',
    tags,
    confidence: decisions.length > 0 ? 0.7 : 0.4,
  });

  // Save to long-term session memory
  if (decisions.length > 0 || tags.length > 0) {
    saveSessionSummary(cwd, summary, decisions, files, tags);
  }

  // Record in knowledge graph
  if (files.length > 0 || decisions.length > 0) {
    recordSessionGraph(cwd, summary, decisions, files, tags, '', '');
  }

  // Award XP for repeated patterns (tag-based)
  for (const tag of tags) {
    awardNodeXP(cwd, `tag::${tag}`, 5);
  }
}

/**
 * Extract a summary from tool args + result for inline contexts
 * where there's no natural summary string.
 */
export function summarizeToolEvent(event: ToolResultEvent): string {
  const parts: string[] = [];

  if (event.toolName === 'FileEditTool' || event.toolName === 'FileWriteTool') {
    const path = event.args.file_path || event.args.filePath || '';
    parts.push(`Modified ${path}`);
  } else if (event.toolName === 'Bash') {
    const cmd = String(event.args.command || '').slice(0, 120);
    parts.push(`Ran: ${cmd}`);
  }

  if (event.result.summary) {
    parts.push(`→ ${event.result.summary}`);
  }

  return parts.join(' ');
}
