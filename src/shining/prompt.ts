import { policyFor } from './policy.js';
import { formatPrefetched, prefetchShiningContext } from './prefetch.js';
import { list } from './premonition-store.js';

export async function loadShiningPrompt(): Promise<string | null> {
  const premonitions = list().filter(p => policyFor(p.confidence) !== 'ignore');
  if (premonitions.length === 0) return null;
  const lines: string[] = ['<shining_premonitions>'];
  for (const p of premonitions.slice(0, 3)) {
    const action = policyFor(p.confidence);
    lines.push(`- [${p.kind} ${(p.confidence * 100).toFixed(0)}% → ${action}] ${p.prediction}`);
    if (p.suggestedContext?.length) lines.push(`  context: ${p.suggestedContext.join(', ')}`);
    if (p.evidence.length)
      lines.push(
        `  evidence: ${p.evidence
          .map(e => e.detail)
          .join('; ')
          .slice(0, 120)}`,
      );
    // Todo integration: surface as suggested next todo
    if ((p.kind === 'missing_evidence' || p.kind === 'next_intent') && p.confidence >= 0.6) {
      lines.push(`  → Suggested Todo: ${p.prediction}`);
    }
    if (p.kind === 'next_tool' && p.confidence >= 0.6) {
      lines.push(`  → Suggested next tool: ${p.prediction.replace('next_tool: ', '')}`);
    }
  }
  lines.push('</shining_premonitions>');
  // Context Compiler: prefetch suggestedContext files when confidence >=0.5 (prefetch+)
  try {
    const prefetched = await prefetchShiningContext();
    const formatted = formatPrefetched(prefetched);
    if (formatted) {
      lines.push('');
      lines.push(formatted);
    }
  } catch {}
  const out = lines.join('\n');
  return out.length > 4000 ? out.slice(0, 4000) + '\n...</shining_premonitions>' : out;
}
