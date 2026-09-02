/**
 * Predictor — cheap heuristic → candidate → (optional) LLM judge → Premonition
 */

import { getRecentEvents } from './observer.js';
import { rank, scorePremonition } from './scorer.js';
import { save } from './premonition-store.js';
import type { Premonition, ShiningContext } from './types.js';

function id(): string {
  return `shin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

const TTL_MS = 10 * 60 * 1000; // 10 min

function heuristicPredict(
  ctx: ShiningContext,
  events: ReturnType<typeof getRecentEvents>,
): Omit<Premonition, 'id' | 'createdAt'>[] {
  const out: Omit<Premonition, 'id' | 'createdAt'>[] = [];
  const files = events.filter(e => e.type === 'file_changed').map(e => (e as any).path as string);

  const has = (p: string) => files.some(f => f.includes(p));
  const changedJenkins = has('Jenkinsfile') || has('jenkins');
  const changedDocker = has('docker') || has('Dockerfile') || has('docker-compose');
  const intent = ctx.userIntent || '';

  // Example from spec: Docker + Jenkins → verify env source
  if (changedJenkins && changedDocker) {
    out.push({
      kind: 'needed_context',
      prediction: 'user may need to verify deployment env source',
      confidence: 0.84,
      evidence: [
        { source: 'file_changed', detail: 'Jenkinsfile changed' },
        { source: 'file_changed', detail: 'docker config changed' },
        { source: 'repo_state', detail: '.env source unresolved' },
      ],
      suggestedContext: ['Jenkinsfile', 'docker-compose.yml', '.env.production'],
      expiresAt: Date.now() + TTL_MS,
    });
  }

  // Generic: intent contains deploy → risk
  if (intent.toLowerCase().includes('deploy') || intent.includes('ดีพลอย')) {
    out.push({
      kind: 'risk',
      prediction: 'deployment may fail if env not verified',
      confidence: 0.68,
      evidence: [{ source: 'user_intent', detail: intent.slice(0, 80) }],
      expiresAt: Date.now() + TTL_MS,
    });
  }

  // Missing evidence: task graph has gaps
  if (ctx.taskGraph?.some(t => t.includes('test') && !files.some(f => f.includes('test')))) {
    out.push({
      kind: 'missing_evidence',
      prediction: 'tests not yet verified for recent changes',
      confidence: 0.62,
      evidence: [{ source: 'task_graph', detail: 'test task pending' }],
      expiresAt: Date.now() + TTL_MS,
    });
  }

  // Next tool: task graph hints
  if (ctx.taskGraph?.some(t => t.toLowerCase().includes('test'))) {
    out.push({
      kind: 'next_tool',
      prediction: 'next_tool: Bash (run tests)',
      confidence: 0.71,
      evidence: [{ source: 'task_graph', detail: 'test task in graph' }],
      suggestedContext: ['package.json'],
      expiresAt: Date.now() + TTL_MS,
    });
  }
  if (files.some(f => f.endsWith('.md') || f.includes('memory'))) {
    out.push({
      kind: 'next_tool',
      prediction: 'next_tool: Read (verify docs)',
      confidence: 0.58,
      evidence: [{ source: 'file_changed', detail: 'docs changed' }],
      expiresAt: Date.now() + TTL_MS,
    });
  }

  return out;
}

export async function predict(ctx: ShiningContext = {}): Promise<Premonition[]> {
  const events = getRecentEvents();
  const candidates = heuristicPredict(ctx, events);
  // Taste prior: fetch active taste rules for boosting
  let tasteRules: any[] = [];
  try {
    const { getTasteStore } = await import('../taste/store/taste-store.js');
    tasteRules = await getTasteStore().list({ status: 'active' as any });
  } catch {}
  const withScores: Premonition[] = candidates.map(c => ({
    id: id(),
    createdAt: Date.now(),
    ...c,
    confidence: scorePremonition(c, tasteRules),
  }));
  const ranked = rank(withScores);
  for (const p of ranked) save(p);
  return ranked;
}
